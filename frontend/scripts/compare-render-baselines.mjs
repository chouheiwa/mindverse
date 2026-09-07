import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { decodePng } from './framePixels.mjs'
import {
  PARITY_STATE_NAMES,
  compareFrameDescriptors,
  compareVisualParitySets,
  describeFrame,
  formatDeviation,
} from './frameParity.mjs'

// 与 src/starmap/renderBudget.ts 同值。两处都判定同一份采集，口径不能分叉；
// 那里有完整的取舍说明（为什么是 p95、为什么要噪声下限）。
const RELATIVE_BUDGET_TOLERANCE = 1.2
const RELATIVE_BUDGET_NOISE_FLOOR_MS = 0.5
const STARTUP_CEILING_MS = 3_000

export const STELLAR_BASELINE_SCHEMA = 'babylon-stellar-baseline.v1'
export const PLANET_BASELINE_SCHEMA = 'babylon-planets-baseline.v1'
export const VISUAL_PARITY_SCHEMA = 'mindverse-visual-parity.v1'
export const STELLAR_STATE_NAMES = Object.freeze([
  'panorama', 'approach-midpoint', 'focused-star', 'planet-focus',
])
export const PLANET_STATE_NAMES = Object.freeze(['magma', 'desert', 'rock', 'tundra', 'ice'])
export const PLANET_IMAGE_NAMES = Object.freeze([...PLANET_STATE_NAMES, 'far-a', 'far-b', 'far-flip'])

const PERFORMANCE_QUALITIES = Object.freeze(['medium', 'low'])
const ABSOLUTE_BUDGETS = Object.freeze({ medium: 20, low: 33.3 })
const STELLAR_FIXTURE_VERSION = 'strata-universe.v1'
const STELLAR_VIEWPORT = Object.freeze({ width: 1440, height: 900, deviceScaleFactor: 1 })

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`render baseline: invalid ${label}`)
  return value
}

function positive(value, label) {
  const result = finite(value, label)
  if (result <= 0) throw new Error(`render baseline: invalid ${label}`)
  return result
}

function ratio(value, label) {
  const result = finite(value, label)
  if (result < 0 || result > 1) throw new Error(`render baseline: invalid ${label}`)
  return result
}

function validateViewportShape(viewport) {
  if (!viewport
    || !Number.isInteger(viewport.width) || viewport.width <= 0
    || !Number.isInteger(viewport.height) || viewport.height <= 0
    || !Number.isFinite(viewport.deviceScaleFactor) || viewport.deviceScaleFactor <= 0) {
    throw new Error('render baseline: invalid viewport')
  }
}

function validateViewport(viewport) {
  validateViewportShape(viewport)
  if (viewport.width !== STELLAR_VIEWPORT.width
    || viewport.height !== STELLAR_VIEWPORT.height
    || viewport.deviceScaleFactor !== STELLAR_VIEWPORT.deviceScaleFactor) {
    throw new Error('render baseline: stellar viewport must be 1440x900 at DPR 1')
  }
}

function validateCamera(name, camera) {
  if (!camera
    || positive(camera.distance, `${name} camera distance`) <= 0
    || !Number.isFinite(camera.alpha)
    || !Number.isFinite(camera.beta) || camera.beta <= 0 || camera.beta >= Math.PI
    || !Array.isArray(camera.target)
    || camera.target.length !== 3
    || !camera.target.every(Number.isFinite)) {
    throw new Error(`render baseline: invalid ${name} camera`)
  }
}

function validatePresentation(name, presentation) {
  const validFocus = presentation?.focusedStarKey === null
    || (typeof presentation?.focusedStarKey === 'string' && presentation.focusedStarKey.length > 0)
  if (!presentation
    || !validFocus
    || !Number.isFinite(presentation.approachProgress)
    || presentation.approachProgress < 0 || presentation.approachProgress > 1
    || !Number.isFinite(presentation.systemReveal)
    || presentation.systemReveal < 0 || presentation.systemReveal > 1
    || !Number.isInteger(presentation.visibleQuestionOrbits) || presentation.visibleQuestionOrbits < 0
    || !Number.isInteger(presentation.visibleQuestionPlanets) || presentation.visibleQuestionPlanets < 0
    || typeof presentation.shaderFallback !== 'boolean') {
    throw new Error(`render baseline: invalid ${name} presentation`)
  }
  if (name === 'panorama') {
    if (presentation.focusedStarKey !== null) throw new Error('render baseline: panorama must not have focus')
    if (presentation.approachProgress !== 0 || presentation.systemReveal !== 0
      || presentation.visibleQuestionOrbits !== 0 || presentation.visibleQuestionPlanets !== 0) {
      throw new Error('render baseline: invalid panorama presentation')
    }
  } else if (presentation.focusedStarKey === null) {
    throw new Error(`render baseline: ${name} must have focus`)
  }
  if (name === 'approach-midpoint' && Math.abs(presentation.approachProgress - 0.65) > 1e-6) {
    throw new Error('render baseline: invalid approach-midpoint presentation')
  }
  if (name === 'approach-midpoint' && Math.abs(presentation.systemReveal - 0.216) > 1e-6) {
    throw new Error('render baseline: invalid approach-midpoint presentation')
  }
  if ((name === 'focused-star' || name === 'planet-focus')
    && (presentation.approachProgress !== 1 || presentation.systemReveal !== 1)) {
    throw new Error(`render baseline: invalid ${name} presentation`)
  }
  if (name !== 'panorama'
    && (presentation.visibleQuestionOrbits <= 0 || presentation.visibleQuestionPlanets <= 0)) {
    throw new Error(`render baseline: invalid ${name} presentation`)
  }
}

function validateState(name, state) {
  if (!state) throw new Error(`render baseline: missing state ${name}`)
  const core = finite(state.corePixelDiameter, `${name} core diameter`)
  const halo = finite(state.haloPixelDiameter, `${name} halo diameter`)
  const nonBackground = ratio(state.nonBackgroundRatio, `${name} non-background ratio`)
  const variance = finite(state.luminanceVariance, `${name} luminance variance`)
  const clippedWhite = ratio(state.clippedWhiteRatio, `${name} clipped-white ratio`)
  if (variance < 0) throw new Error(`render baseline: invalid ${name} luminance variance`)
  if (core < 2 || halo < Math.max(6, core * 1.2)) throw new Error(`render baseline: point-only radius in ${name}`)
  if (nonBackground < 0.001 && variance < 0.00001) throw new Error(`render baseline: black frame in ${name}`)
  if (clippedWhite > 0.08) throw new Error(`render baseline: blown-white frame in ${name}`)
  validateCamera(name, state.camera)
  validatePresentation(name, state.presentation)
}

function relativeSizeDrift(name, metric, reference, measured) {
  const ratio = measured / reference
  if (ratio < 0.65 || ratio > 1.5) throw new Error(`render baseline: ${name} ${metric} drift exceeded 35/50%`)
}

function angularDistance(left, right) {
  const raw = Math.abs(left - right) % (Math.PI * 2)
  return Math.min(raw, Math.PI * 2 - raw)
}

function compareState(name, reference, measured) {
  relativeSizeDrift(name, 'core size', reference.corePixelDiameter, measured.corePixelDiameter)
  relativeSizeDrift(name, 'halo size', reference.haloPixelDiameter, measured.haloPixelDiameter)
  if (Math.abs(measured.nonBackgroundRatio - reference.nonBackgroundRatio) > 0.12) {
    throw new Error(`render baseline: ${name} non-background drift exceeded 0.12`)
  }
  const varianceDifference = Math.abs(measured.luminanceVariance - reference.luminanceVariance)
  const varianceRatio = measured.luminanceVariance / Math.max(reference.luminanceVariance, 1e-6)
  if (varianceDifference > 0.012 && (varianceRatio < 0.5 || varianceRatio > 2)) {
    throw new Error(`render baseline: ${name} luminance variance drift exceeded tolerance`)
  }
  if (Math.abs(measured.clippedWhiteRatio - reference.clippedWhiteRatio) > 0.02) {
    throw new Error(`render baseline: ${name} clipped-white drift exceeded 0.02`)
  }
  const distanceRatio = measured.camera.distance / reference.camera.distance
  if (distanceRatio < 0.7 || distanceRatio > 1.35) {
    throw new Error(`render baseline: ${name} camera distance drift exceeded tolerance`)
  }
  if (angularDistance(measured.camera.alpha, reference.camera.alpha) > 0.5
    || Math.abs(measured.camera.beta - reference.camera.beta) > 0.35) {
    throw new Error(`render baseline: ${name} camera angle drift exceeded tolerance`)
  }
  const targetDrift = Math.hypot(...measured.camera.target.map((value, index) => value - reference.camera.target[index]))
  if (targetDrift > Math.max(2, reference.camera.distance * 0.15)) {
    throw new Error(`render baseline: ${name} camera target drift exceeded tolerance`)
  }
  if (measured.presentation.focusedStarKey !== reference.presentation.focusedStarKey) {
    throw new Error(`render baseline: ${name} focus drift detected`)
  }
  for (const [label, key] of [['orbit', 'visibleQuestionOrbits'], ['planet', 'visibleQuestionPlanets']]) {
    const allowed = Math.max(1, Math.ceil(reference.presentation[key] * 0.5))
    if (Math.abs(measured.presentation[key] - reference.presentation[key]) > allowed) {
      throw new Error(`render baseline: ${name} ${label} count drift exceeded tolerance`)
    }
  }
  if (measured.presentation.shaderFallback !== reference.presentation.shaderFallback) {
    throw new Error(`render baseline: ${name} shader fallback drift detected`)
  }
}

function validateReferenceDevice(referenceDevice) {
  if (!referenceDevice
    || typeof referenceDevice.enforceAbsoluteBudgets !== 'boolean'
    || typeof referenceDevice.platform !== 'string' || referenceDevice.platform.length === 0
    || !['metal', 'swiftshader', 'unknown'].includes(referenceDevice.graphicsBackend)) {
    throw new Error('render baseline: invalid reference device metadata')
  }
  if (referenceDevice.enforceAbsoluteBudgets
    && (referenceDevice.platform !== 'darwin' || referenceDevice.graphicsBackend !== 'metal')) {
    throw new Error('render baseline: reference device enforcement requires macOS Metal')
  }
}

function validatePerformanceState(quality, state) {
  if (!state) throw new Error(`render baseline: missing ${quality} performance state`)
  positive(state.p95FrameTime, `${quality} p95`)
  positive(state.absoluteBudgetMs, `${quality} absolute performance budget`)
  // 绝对预算比对的是这两个数，所以它们必须存在且有限 —— 缺了就不能默默跳过。
  positive(state.renderCostMs, `${quality} render cost`)
  positive(state.maxRenderCostMs, `${quality} max render cost`)
  // 判定用的是 p95 和首屏，缺了就不能默默跳过 —— 那正是门禁形同虚设的老路。
  positive(state.p95RenderCostMs, `${quality} p95 render cost`)
  positive(state.firstInteractiveMs, `${quality} first interactive`)
  if (Math.abs(state.absoluteBudgetMs - ABSOLUTE_BUDGETS[quality]) > 1e-6) {
    throw new Error(`render baseline: invalid ${quality} absolute performance budget`)
  }
  if (!Number.isInteger(state.sampleCount) || state.sampleCount <= 0) {
    throw new Error(`render baseline: invalid ${quality} sample count`)
  }
  if (state.fixtureVersion !== 'strata-universe.dense-500.v1') {
    throw new Error(`render baseline: invalid ${quality} performance fixture`)
  }
  if (state.starCount !== 500) throw new Error(`render baseline: invalid ${quality} star count`)
  if (state.warmupMs !== 3_000 || state.sampleWindowMs !== 10_000) {
    throw new Error(`render baseline: invalid ${quality} performance sample window`)
  }
  if (!state.hardware || typeof state.hardware.platform !== 'string'
    || state.hardware.platform.length === 0
    || typeof state.hardware.userAgent !== 'string' || state.hardware.userAgent.length === 0
    || !Number.isInteger(state.hardware.hardwareConcurrency) || state.hardware.hardwareConcurrency <= 0
    || !(state.hardware.deviceMemory === null
      || (Number.isFinite(state.hardware.deviceMemory) && state.hardware.deviceMemory > 0))
    || !(state.hardware.gpuVendor === null || typeof state.hardware.gpuVendor === 'string')
    || !(state.hardware.gpuRenderer === null || typeof state.hardware.gpuRenderer === 'string')
    || !['metal', 'swiftshader', 'unknown'].includes(state.hardware.graphicsBackend)) {
    throw new Error(`render baseline: invalid ${quality} hardware metadata`)
  }
}

/**
 * 收集式比对：逐项跑，把**所有**失败攒起来再一次抛出。
 * 首个失败即抛会把一次波及多处的漂移报成孤零零一处，让人误判成噪声。
 * 只有一处失败时原样透传，既有用例断言的精确文案因此不变。
 */
function runAll(checks) {
  const failures = []
  for (const check of checks) {
    try { check() } catch (error) { failures.push(error.message) }
  }
  if (failures.length === 1) throw new Error(failures[0])
  if (failures.length > 1) {
    throw new Error(`render baseline: ${failures.length} checks failed\n- ${failures.join('\n- ')}`)
  }
}

function performanceChecks(baseline, candidate) {
  return PERFORMANCE_QUALITIES.map((quality) => () => {
    const reference = baseline.performance?.[quality]
    const measured = candidate.performance?.[quality]
    validatePerformanceState(quality, reference)
    validatePerformanceState(quality, measured)
    // 预算和回归约束的都是**渲染开销**，不是调度间隔：30fps 空闲节流把
    // p95FrameTime 钉在 33–43ms，与这一屏画了多少东西无关。拿它比 20ms 绝对
    // 预算永远红，拿它比「基线 × 1.2」则两侧恒等、永远绿——两头都不是门禁。
    //
    // 用采样窗的 p95 而不是峰值：峰值是全时段极值，单帧 GC 或合成器抖动就能
    // 支配它。口径必须和 src/starmap/renderBudget.ts 一致，否则同一份采集会在
    // Playwright 里绿、在命令行里红。
    if (candidate.referenceDevice.enforceAbsoluteBudgets
      && measured.p95RenderCostMs > ABSOLUTE_BUDGETS[quality]) {
      throw new Error(`render baseline: absolute ${quality} render cost budget exceeded`)
    }
    const allowedCost = Math.max(
      reference.p95RenderCostMs * RELATIVE_BUDGET_TOLERANCE,
      reference.p95RenderCostMs + RELATIVE_BUDGET_NOISE_FLOOR_MS,
    )
    if (measured.p95RenderCostMs > allowedCost) {
      throw new Error(`render baseline: ${quality} render cost regressed over 20%`)
    }
    if (measured.firstInteractiveMs > STARTUP_CEILING_MS) {
      throw new Error(`render baseline: ${quality} first interactive exceeds the startup ceiling`)
    }
  })
}

function stateChecks(baseline, candidate) {
  return STELLAR_STATE_NAMES.map((name) => () => {
    validateState(name, baseline.states?.[name])
    validateState(name, candidate.states?.[name])
    compareState(name, baseline.states[name], candidate.states[name])
  })
}

export function compareRenderBaselines(baseline, candidate) {
  if (baseline.schemaVersion === undefined && candidate.schemaVersion === undefined) {
    // 2026-09-02 的 three/babylon 单帧对已退役：它冻结于垂直切片时期，尺寸闸是
    // 后来才加的且此后没有采集入口，判定说的是一份早已不存在的代码。跨渲染器
    // 取景由 compare:visual-parity 用现采的帧回答，首屏可交互搬进了 stellar 基线。
    // 见 docs/implementation/2026-09-05-independent-final-audit.md §15.5。
    throw new Error(
      'render baseline: the 2026-09-02 three/babylon single-frame pair is retired; '
      + 'use compare:visual-parity for cross-renderer framing',
    )
  }
  if (baseline.schemaVersion !== STELLAR_BASELINE_SCHEMA
    || candidate.schemaVersion !== STELLAR_BASELINE_SCHEMA) {
    throw new Error(`render baseline: schema must be ${STELLAR_BASELINE_SCHEMA}`)
  }
  if (baseline.rendererKind !== 'babylon' || candidate.rendererKind !== 'babylon') {
    throw new Error('render baseline: renderer kind must be Babylon')
  }
  if (baseline.fixtureVersion !== STELLAR_FIXTURE_VERSION
    || candidate.fixtureVersion !== STELLAR_FIXTURE_VERSION
    || baseline.fixtureVersion !== candidate.fixtureVersion) {
    throw new Error('render baseline: fixture mismatch')
  }
  validateViewport(baseline.viewport)
  validateViewport(candidate.viewport)
  if (baseline.viewport.width !== candidate.viewport.width
    || baseline.viewport.height !== candidate.viewport.height
    || baseline.viewport.deviceScaleFactor !== candidate.viewport.deviceScaleFactor) {
    throw new Error('render baseline: viewport mismatch')
  }
  validateReferenceDevice(baseline.referenceDevice)
  validateReferenceDevice(candidate.referenceDevice)
  runAll([...stateChecks(baseline, candidate), ...performanceChecks(baseline, candidate)])
  return { rendererKind: candidate.rendererKind, states: [...STELLAR_STATE_NAMES] }
}

export function deriveStellarPngPaths(jsonPath) {
  const stem = basename(jsonPath, '.json')
  const directory = dirname(jsonPath)
  return Object.fromEntries(STELLAR_STATE_NAMES.map((name) => [name, resolve(directory, `${stem}-${name}.png`)]))
}

export function derivePlanetPngPaths(jsonPath) {
  const stem = basename(jsonPath, '.json')
  const directory = dirname(jsonPath)
  return Object.fromEntries(PLANET_IMAGE_NAMES.map((name) => [name, resolve(directory, `${stem}-${name}.png`)]))
}

export function deriveParityPngPaths(jsonPath) {
  const stem = basename(jsonPath, '.json')
  const directory = dirname(jsonPath)
  return Object.fromEntries(PARITY_STATE_NAMES.map((name) => [name, resolve(directory, `${stem}-${name}.png`)]))
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export async function validateParityPngArtifacts(jsonPath) {
  const paths = deriveParityPngPaths(jsonPath)
  for (const name of PARITY_STATE_NAMES) {
    let png
    try { png = await readFile(paths[name]) } catch { throw new Error(`visual parity: missing PNG artifact ${name}`) }
    if (png.length === 0) throw new Error(`visual parity: empty PNG artifact ${name}`)
    if (png.length < PNG_SIGNATURE.length || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      throw new Error(`visual parity: invalid PNG signature for ${name}`)
    }
  }
  return paths
}

/** Reads and describes one PNG so a verdict is always derived from pixels, never from prose. */
export async function readFrameDescriptor(path, label) {
  let png
  try { png = await readFile(path) } catch { throw new Error(`visual parity: cannot read ${label} at ${path}`) }
  if (png.length === 0) throw new Error(`visual parity: ${label} is an empty file`)
  return describeFrame(decodePng(png))
}

export async function readParityFrames(jsonPath) {
  const paths = await validateParityPngArtifacts(jsonPath)
  const entries = await Promise.all(PARITY_STATE_NAMES.map(async (name) =>
    [name, await readFrameDescriptor(paths[name], `${basename(jsonPath, '.json')} ${name}`)]))
  return Object.fromEntries(entries)
}

function validateParityDocument(document, label) {
  if (!document || typeof document !== 'object') throw new Error(`visual parity: ${label} document is not an object`)
  if (document.schemaVersion !== VISUAL_PARITY_SCHEMA) {
    throw new Error(`visual parity: schema must be ${VISUAL_PARITY_SCHEMA} (${label})`)
  }
  if (document.rendererKind !== 'three' && document.rendererKind !== 'babylon') {
    throw new Error(`visual parity: unknown renderer kind in ${label}`)
  }
  if (typeof document.fixtureVersion !== 'string' || document.fixtureVersion.length === 0) {
    throw new Error(`visual parity: ${label} fixture version is missing`)
  }
  validateViewportShape(document.viewport)
  for (const name of PARITY_STATE_NAMES) {
    if (!document.states?.[name]) throw new Error(`visual parity: ${label} never captured ${name}`)
  }
}

/**
 * Cross-renderer verdict. `frames` must carry decoded descriptors for both
 * sides — without pixels this throws instead of quietly reporting parity,
 * because a metadata-only pass is exactly the hole this gate exists to close.
 */
export const EXPECTED_PARITY_FILE = 'visual-parity-expected.json'

/** 读取并校验预期失败清单。缺文件或结构不对都必须炸：静默跳过等于把门禁关掉。 */
export async function readExpectedParityFailures(path) {
  const document = await readBaselineDocument(path, 'expected-failures manifest')
  if (document.schemaVersion !== 'mindverse-visual-parity-expected.v1') {
    throw new Error('visual parity: expected-failures manifest schema must be mindverse-visual-parity-expected.v1')
  }
  const expected = document.expected
  if (!expected || typeof expected !== 'object' || Array.isArray(expected)) {
    throw new Error('visual parity: expected-failures manifest has no `expected` map')
  }
  for (const [name, metrics] of Object.entries(expected)) {
    if (!PARITY_STATE_NAMES.includes(name)) {
      throw new Error(`visual parity: expected-failures manifest names unknown state ${name}`)
    }
    if (!Array.isArray(metrics) || metrics.some((metric) => typeof metric !== 'string')) {
      throw new Error(`visual parity: expected-failures manifest entry ${name} must be a string array`)
    }
  }
  return { expected, count: Object.values(expected).flat().length }
}

export function compareVisualParityDocuments(reference, candidate, frames, options = {}, expectedFailures = null) {
  validateParityDocument(reference, 'reference')
  validateParityDocument(candidate, 'candidate')
  if (reference.fixtureVersion !== candidate.fixtureVersion) throw new Error('visual parity: fixture mismatch')
  if (reference.viewport.width !== candidate.viewport.width
    || reference.viewport.height !== candidate.viewport.height
    || reference.viewport.deviceScaleFactor !== candidate.viewport.deviceScaleFactor) {
    throw new Error('visual parity: viewport mismatch')
  }
  if (!frames?.reference || !frames?.candidate) {
    throw new Error('visual parity: refusing to compare without decoded frames for both sides')
  }
  const result = compareVisualParitySets(frames.reference, frames.candidate, options)
  if (expectedFailures) {
    const { unexpected, resolved } = reconcileExpectedParityFailures(result.states, expectedFailures)
    const detail = result.states
      .filter(({ parity }) => !parity)
      .map(({ name, deviations }) => `  ${name}:\n${deviations.map((item) => `    - ${formatDeviation(item)}`).join('\n')}`)
      .join('\n')
    if (unexpected.length > 0 || resolved.length > 0) {
      throw new Error(
        `visual parity: divergence set no longer matches ${EXPECTED_PARITY_FILE}\n`
        + (unexpected.length > 0 ? `  new, undeclared: ${unexpected.join(', ')}\n` : '')
        + (resolved.length > 0 ? `  declared but no longer failing (remove from the manifest): ${resolved.join(', ')}\n` : '')
        + detail,
      )
    }
    return {
      referenceKind: reference.rendererKind,
      rendererKind: candidate.rendererKind,
      states: result.states,
      parity: result.parity,
      failedStates: result.failedStates,
    }
  }
  if (!result.parity) {
    const detail = result.states
      .filter(({ parity }) => !parity)
      .map(({ name, deviations }) => `  ${name}:\n${deviations.map((item) => `    - ${formatDeviation(item)}`).join('\n')}`)
      .join('\n')
    throw new Error(
      `visual parity: ${candidate.rendererKind} has not caught up with ${reference.rendererKind} in `
      + `${result.failedStates.join(', ')}\n${detail}`,
    )
  }
  return {
    referenceKind: reference.rendererKind,
    rendererKind: candidate.rendererKind,
    states: result.states,
    parity: true,
    failedStates: [],
  }
}

/**
 * 把实测越界集合与「预期失败清单」对账。
 *
 * 「永远红 + 靠文档解释为什么可以红」的门禁有个隐蔽的失效方式：**新增一项越界
 * 不会改变它的颜色**。改成对账之后，多一项（unexpected）和少一项（resolved）
 * 都必须让门禁变红——前者是新漂移，后者说明有人修好了却没更新清单。
 *
 * 这不放宽任何容差：容差仍由 frameParity 判定，清单只决定哪些**已判定越界**的
 * 项目是已经申报过的。
 */
export function reconcileExpectedParityFailures(states, manifest) {
  const actual = new Set()
  for (const state of states) {
    for (const { metric } of state.deviations ?? []) actual.add(`${state.name}/${metric}`)
  }
  const expected = new Set()
  for (const [name, metrics] of Object.entries(manifest ?? {})) {
    for (const metric of metrics) expected.add(`${name}/${metric}`)
  }
  return {
    unexpected: [...actual].filter((key) => !expected.has(key)).sort(),
    resolved: [...expected].filter((key) => !actual.has(key)).sort(),
  }
}

function validatePlanetSample(name, sample) {
  if (!sample || sample.thermal !== name) throw new Error(`planet baseline: invalid ${name} thermal identity`)
  positive(sample.bodyDiameter, `${name} body diameter`)
  const dayNight = ratio(sample.dayNightContrast, `${name} day/night contrast`)
  const atmosphere = ratio(sample.atmosphereEdgeRatio, `${name} atmosphere edge ratio`)
  const bloom = ratio(sample.bloomHighlightRatio, `${name} bloom highlight ratio`)
  const variance = ratio(sample.colorVariance, `${name} color variance`)
  positive(sample.roughnessContrast, `${name} roughness contrast`)
  if (!Array.isArray(sample.meanColor) || sample.meanColor.length !== 3 || !sample.meanColor.every(Number.isFinite)) {
    throw new Error(`planet baseline: invalid ${name} mean color`)
  }
  if (dayNight < 0.06) throw new Error(`planet baseline: ${name} day/night contrast below gate`)
  if (atmosphere < 0.005 || atmosphere > 0.35) throw new Error(`planet baseline: ${name} atmosphere edge outside gate`)
  if (bloom > (name === 'magma' ? 0.12 : 0.04)) throw new Error(`planet baseline: ${name} bloom highlight exceeds gate`)
  if (variance < 0.001) throw new Error(`planet baseline: ${name} color variance below gate`)
}

function comparePlanetSample(name, reference, measured) {
  validatePlanetSample(name, reference)
  validatePlanetSample(name, measured)
  relativeSizeDrift(name, 'body size', reference.bodyDiameter, measured.bodyDiameter)
  for (const metric of ['dayNightContrast', 'atmosphereEdgeRatio', 'bloomHighlightRatio', 'colorVariance', 'roughnessContrast']) {
    const allowed = Math.max(0.015, Math.abs(reference[metric]) * 0.5)
    if (Math.abs(measured[metric] - reference[metric]) > allowed) {
      throw new Error(`planet baseline: ${name} ${metric} drift exceeded tolerance`)
    }
  }
  const colorDrift = Math.hypot(...measured.meanColor.map((value, index) => value - reference.meanColor[index]))
  if (colorDrift > 0.18) throw new Error(`planet baseline: ${name} mean color drift exceeded tolerance`)
}

function validateMaterialSeparation(samples) {
  for (let left = 0; left < PLANET_STATE_NAMES.length; left += 1) {
    for (let right = left + 1; right < PLANET_STATE_NAMES.length; right += 1) {
      const a = samples[PLANET_STATE_NAMES[left]]
      const b = samples[PLANET_STATE_NAMES[right]]
      const colorDistance = Math.hypot(...a.meanColor.map((value, index) => value - b.meanColor[index]))
      if (colorDistance <= 0.015) {
        throw new Error(`planet baseline: ${a.thermal}/${b.thermal} material statistics are not distinguishable`)
      }
    }
  }
}

function validateFarSample(far) {
  if (!far || !PLANET_STATE_NAMES.includes(far.thermal)) throw new Error('planet baseline: invalid far thermal identity')
  if (far.surfaceLevel !== 'low') throw new Error('planet baseline: far LOD must be low')
  if (far.highPlanetCount !== 0) throw new Error('planet baseline: far sample must not retain a high mesh')
  if (far.highFrequencyDetail !== false) throw new Error('planet baseline: far sample must disable high-frequency detail')
  if (ratio(far.silhouetteDrift, 'far silhouette drift') > 0.02) throw new Error('planet baseline: far silhouette drift exceeds gate')
  if (finite(far.lightAlignment, 'far light alignment') <= 0.05) throw new Error('planet baseline: far light direction does not align')
  if (finite(far.lightDirectionFlip, 'far light direction flip') >= -0.5) throw new Error('planet baseline: far light direction did not flip')
}

export function comparePlanetRenderBaselines(baseline, candidate) {
  for (const document of [baseline, candidate]) {
    if (document.schemaVersion !== PLANET_BASELINE_SCHEMA) throw new Error(`planet baseline: schema must be ${PLANET_BASELINE_SCHEMA}`)
    if (document.fixtureVersion !== 'planet-render-gate.v1') throw new Error('planet baseline: fixture mismatch')
    if (document.rendererKind !== 'babylon') throw new Error('planet baseline: renderer kind must be Babylon')
    validateViewport(document.viewport)
    for (const name of PLANET_STATE_NAMES) validatePlanetSample(name, document.samples?.[name])
    validateMaterialSeparation(document.samples)
    validateFarSample(document.far)
  }
  for (const name of PLANET_STATE_NAMES) comparePlanetSample(name, baseline.samples[name], candidate.samples[name])
  return { rendererKind: 'babylon', states: [...PLANET_STATE_NAMES, 'far'] }
}

export async function validateStellarPngArtifacts(jsonPath) {
  const paths = deriveStellarPngPaths(jsonPath)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  for (const name of STELLAR_STATE_NAMES) {
    let png
    try {
      png = await readFile(paths[name])
    } catch {
      throw new Error(`render baseline: missing PNG artifact ${name}`)
    }
    if (png.length === 0) throw new Error(`render baseline: empty PNG artifact ${name}`)
    if (png.length < signature.length || !png.subarray(0, signature.length).equals(signature)) {
      throw new Error(`render baseline: invalid PNG signature for ${name}`)
    }
  }
  return paths
}

export async function validatePlanetPngArtifacts(jsonPath) {
  const paths = derivePlanetPngPaths(jsonPath)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  for (const name of PLANET_IMAGE_NAMES) {
    let png
    try { png = await readFile(paths[name]) } catch { throw new Error(`planet baseline: missing PNG artifact ${name}`) }
    if (png.length === 0) throw new Error(`planet baseline: empty PNG artifact ${name}`)
    if (png.length < signature.length || !png.subarray(0, signature.length).equals(signature)) {
      throw new Error(`planet baseline: invalid PNG signature for ${name}`)
    }
  }
  return paths
}

/**
 * 基线/候选文档的唯一读取口。缺文件和坏 JSON 都是人为可修的操作错误，
 * 报出 node 的 ENOENT 堆栈只会让人以为脚本自己坏了。
 */
export async function readBaselineDocument(path, label) {
  let raw
  try {
    raw = await readFile(resolve(path), 'utf8')
  } catch {
    throw new Error(`render baseline: ${label} file ${basename(path)} is missing — capture it before comparing`)
  }
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`render baseline: ${label} file ${basename(path)} is not valid JSON`)
  }
}

async function main() {
  const [baselinePath, candidatePath] = process.argv.slice(2)
  if (!baselinePath || !candidatePath) throw new Error('usage: compare-render-baselines <baseline.json> <candidate.json>')
  const [baseline, candidate] = await Promise.all([
    readBaselineDocument(baselinePath, 'baseline'),
    readBaselineDocument(candidatePath, 'candidate'),
  ])
  if (baseline.schemaVersion === VISUAL_PARITY_SCHEMA || candidate.schemaVersion === VISUAL_PARITY_SCHEMA) {
    const [referenceFrames, candidateFrames] = await Promise.all([
      readParityFrames(resolve(baselinePath)),
      readParityFrames(resolve(candidatePath)),
    ])
    const manifest = await readExpectedParityFailures(resolve(dirname(baselinePath), EXPECTED_PARITY_FILE))
    const parity = compareVisualParityDocuments(baseline, candidate, {
      reference: referenceFrames, candidate: candidateFrames,
    }, {}, manifest.expected)
    process.stdout.write(
      `visual parity verified: ${parity.rendererKind} vs ${parity.referenceKind}; `
      + `states ${parity.states.map(({ name }) => name).join(', ')}; `
      + `${manifest.count} declared divergences unchanged\n`,
    )
    return
  }
  if (baseline.schemaVersion === PLANET_BASELINE_SCHEMA || candidate.schemaVersion === PLANET_BASELINE_SCHEMA) {
    await Promise.all([
      validatePlanetPngArtifacts(resolve(baselinePath)),
      validatePlanetPngArtifacts(resolve(candidatePath)),
    ])
    const result = comparePlanetRenderBaselines(baseline, candidate)
    process.stdout.write(`render baselines verified: ${result.rendererKind}; states ${result.states.join(', ')}\n`)
    return
  }
  if (baseline.schemaVersion !== undefined || candidate.schemaVersion !== undefined) {
    await Promise.all([
      validateStellarPngArtifacts(resolve(baselinePath)),
      validateStellarPngArtifacts(resolve(candidatePath)),
    ])
  }
  const result = compareRenderBaselines(baseline, candidate)
  process.stdout.write(`render baselines verified: ${result.rendererKind}; states ${result.states.join(', ')}\n`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
