import { readFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const STELLAR_BASELINE_SCHEMA = 'babylon-stellar-baseline.v1'
export const PLANET_BASELINE_SCHEMA = 'babylon-planets-baseline.v1'
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

function validateViewport(viewport) {
  if (!viewport
    || !Number.isInteger(viewport.width) || viewport.width <= 0
    || !Number.isInteger(viewport.height) || viewport.height <= 0
    || !Number.isFinite(viewport.deviceScaleFactor) || viewport.deviceScaleFactor <= 0) {
    throw new Error('render baseline: invalid viewport')
  }
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

function validatePerformance(baseline, candidate) {
  for (const quality of PERFORMANCE_QUALITIES) {
    const reference = baseline.performance?.[quality]
    const measured = candidate.performance?.[quality]
    validatePerformanceState(quality, reference)
    validatePerformanceState(quality, measured)
    if (measured.p95FrameTime > reference.p95FrameTime * 1.2) {
      throw new Error(`render baseline: ${quality} p95 regressed over 20%`)
    }
    if (candidate.referenceDevice.enforceAbsoluteBudgets
      && measured.p95FrameTime > ABSOLUTE_BUDGETS[quality]) {
      throw new Error(`render baseline: absolute ${quality} p95 budget exceeded`)
    }
  }
}

export function compareRenderBaselines(baseline, candidate) {
  if (baseline.schemaVersion === undefined && candidate.schemaVersion === undefined) {
    return compareLegacyMigrationPair(baseline, candidate)
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
  for (const name of STELLAR_STATE_NAMES) {
    validateState(name, baseline.states?.[name])
    validateState(name, candidate.states?.[name])
    compareState(name, baseline.states[name], candidate.states[name])
  }
  validatePerformance(baseline, candidate)
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

function compareLegacyMigrationPair(baseline, candidate) {
  if (baseline.rendererKind !== 'three' || candidate.rendererKind !== 'babylon') {
    throw new Error('render baseline: expected a Three baseline and Babylon candidate')
  }
  if (baseline.fixtureVersion !== candidate.fixtureVersion) throw new Error('render baseline: fixture mismatch')
  if (baseline.viewport?.width !== candidate.viewport?.width || baseline.viewport?.height !== candidate.viewport?.height) {
    throw new Error('render baseline: viewport mismatch')
  }
  if (finite(candidate.p95FrameTime, 'p95') > finite(baseline.p95FrameTime, 'p95') * 1.2) {
    throw new Error('render baseline: p95 frame time regressed over 20%')
  }
  if (finite(candidate.firstInteractiveMs, 'interactive') > finite(baseline.firstInteractiveMs, 'interactive') * 1.3) {
    throw new Error('render baseline: first interactive time regressed over 30%')
  }
  const left = baseline.selectedPlanetBounds
  const right = candidate.selectedPlanetBounds
  if (!left || !right) throw new Error('render baseline: selected object bounds missing')
  const centerDrift = Math.hypot(
    right.x + right.width / 2 - left.x - left.width / 2,
    right.y + right.height / 2 - left.y - left.height / 2,
  )
  if (centerDrift > Math.min(baseline.viewport.width, baseline.viewport.height) * 0.1) {
    throw new Error('render baseline: selected object center drift exceeds 10%')
  }
  if (Math.abs(finite(candidate.nonBackgroundRatio, 'non-background ratio')
    - finite(baseline.nonBackgroundRatio, 'non-background ratio')) > 0.2) {
    throw new Error('render baseline: non-background ratio drift exceeds 20%')
  }
  return { rendererKind: candidate.rendererKind, states: [], centerDrift }
}

async function main() {
  const [baselinePath, candidatePath] = process.argv.slice(2)
  if (!baselinePath || !candidatePath) throw new Error('usage: compare-render-baselines <baseline.json> <candidate.json>')
  const [baseline, candidate] = await Promise.all([
    readFile(resolve(baselinePath), 'utf8').then(JSON.parse),
    readFile(resolve(candidatePath), 'utf8').then(JSON.parse),
  ])
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
