// @vitest-environment node
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  compareRenderBaselines,
  readBaselineDocument,
  comparePlanetRenderBaselines,
  reconcileExpectedParityFailures,
  compareVisualParityDocuments,
  derivePlanetPngPaths,
  deriveParityPngPaths,
  deriveStellarPngPaths,
  validateParityPngArtifacts,
  validateStellarPngArtifacts,
} from './compare-render-baselines.mjs'
import { PARITY_STATE_NAMES, describeFrame } from './frameParity.mjs'

const STATE_NAMES = ['panorama', 'approach-midpoint', 'focused-star', 'planet-focus']

function state(name, overrides = {}) {
  const focused = name === 'panorama' ? null : 'star:v1:public:alpha'
  const approachProgress = name === 'panorama' ? 0 : name === 'approach-midpoint' ? 0.65 : 1
  const systemReveal = name === 'panorama' ? 0 : name === 'approach-midpoint' ? 0.216 : 1
  return {
    corePixelDiameter: 8,
    haloPixelDiameter: 28,
    nonBackgroundRatio: 0.14,
    luminanceVariance: 0.018,
    clippedWhiteRatio: 0.002,
    camera: { distance: 20, alpha: 1, beta: 1, target: [0, 0, 0] },
    presentation: {
      focusedStarKey: focused,
      approachProgress,
      systemReveal,
      visibleQuestionOrbits: name === 'panorama' ? 0 : 2,
      visibleQuestionPlanets: name === 'panorama' ? 0 : 2,
      shaderFallback: false,
    },
    ...overrides,
  }
}

const baseline = () => ({
  schemaVersion: 'babylon-stellar-baseline.v1',
  fixtureVersion: 'strata-universe.v1',
  rendererKind: 'babylon',
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  referenceDevice: { enforceAbsoluteBudgets: false, platform: 'darwin', graphicsBackend: 'metal' },
  states: Object.fromEntries(STATE_NAMES.map((name) => [name, state(name)])),
  performance: {
    medium: performanceState(16, 20),
    low: performanceState(24, 33.3),
  },
})

function performanceState(p95FrameTime, absoluteBudgetMs, p95RenderCostMs = absoluteBudgetMs * 0.5) {
  return {
    fixtureVersion: 'strata-universe.dense-500.v1', starCount: 500,
    p95FrameTime, absoluteBudgetMs, sampleCount: 600, warmupMs: 3_000, sampleWindowMs: 10_000,
    // 峰值刻意给成 p95 的 2 倍：判定看的是 p95，峰值只是随采集带着的记录。
    renderCostMs: p95RenderCostMs * 0.8, p95RenderCostMs, maxRenderCostMs: p95RenderCostMs * 2,
    firstInteractiveMs: 500,
    hardware: {
      platform: 'MacIntel', userAgent: 'Playwright Chromium', hardwareConcurrency: 8,
      deviceMemory: 8, gpuVendor: 'Apple', gpuRenderer: 'ANGLE Metal Renderer', graphicsBackend: 'metal',
    },
  }
}

const candidate = () => structuredClone(baseline())

test('accepts complete stellar states and performance inside the relative budget', () => {
  const result = compareRenderBaselines(baseline(), candidate())
  assert.deepEqual(result.states, STATE_NAMES)
  assert.equal(result.rendererKind, 'babylon')
})

test('rejects missing states in either document', () => {
  const value = candidate()
  delete value.states['approach-midpoint']
  assert.throws(() => compareRenderBaselines(baseline(), value), /missing state.*approach-midpoint/i)
  const reference = baseline()
  delete reference.states['focused-star']
  assert.throws(() => compareRenderBaselines(reference, candidate()), /missing state.*focused-star/i)
})

test('rejects subpixel and point-only stellar radii', () => {
  for (const [corePixelDiameter, haloPixelDiameter] of [[0.1, 8], [4, 4.4]]) {
    const value = candidate()
    value.states.panorama = state('panorama', { corePixelDiameter, haloPixelDiameter })
    assert.throws(() => compareRenderBaselines(baseline(), value), /point-only/i)
  }
})

test('rejects black, blown-white and out-of-domain image metrics', () => {
  for (const overrides of [
    { nonBackgroundRatio: -0.01 }, { nonBackgroundRatio: 1.01 },
    { clippedWhiteRatio: -0.01 }, { clippedWhiteRatio: 1.01 },
    { luminanceVariance: -0.01 },
  ]) {
    const value = candidate()
    value.states.panorama = state('panorama', overrides)
    assert.throws(() => compareRenderBaselines(baseline(), value), /invalid/i)
  }
  const black = candidate()
  black.states.panorama = state('panorama', { nonBackgroundRatio: 0.0001, luminanceVariance: 0.000001 })
  assert.throws(() => compareRenderBaselines(baseline(), black), /black frame/i)
  const white = candidate()
  white.states['focused-star'] = state('focused-star', { clippedWhiteRatio: 0.12 })
  assert.throws(() => compareRenderBaselines(baseline(), white), /blown-white/i)
})

test('rejects material per-state visual, camera and presentation drift', () => {
  for (const [mutate, message] of [
    [(value) => { value.states.panorama.corePixelDiameter = 13 }, /core.*drift/i],
    [(value) => { value.states.panorama.haloPixelDiameter = 44 }, /halo.*drift/i],
    [(value) => { value.states.panorama.nonBackgroundRatio = 0.30 }, /non-background.*drift/i],
    [(value) => { value.states.panorama.luminanceVariance = 0.05 }, /luminance.*drift/i],
    [(value) => { value.states.panorama.clippedWhiteRatio = 0.04 }, /clipped-white.*drift/i],
    [(value) => { value.states.panorama.camera.distance = 30 }, /camera.*distance.*drift/i],
    [(value) => { value.states.panorama.camera.target = [8, 0, 0] }, /camera.*target.*drift/i],
    [(value) => { value.states['focused-star'].presentation.focusedStarKey = 'star:v1:public:other' }, /focus.*drift/i],
    [(value) => { value.states['focused-star'].presentation.visibleQuestionPlanets = 8 }, /planet.*drift/i],
  ]) {
    const value = candidate()
    mutate(value)
    assert.throws(() => compareRenderBaselines(baseline(), value), message)
  }
})

test('rejects renderer, schema, fixture and viewport contract violations', () => {
  assert.throws(() => compareRenderBaselines({ ...baseline(), schemaVersion: 'old' }, candidate()), /schema/i)
  assert.throws(() => compareRenderBaselines({ ...baseline(), rendererKind: 'three' }, candidate()), /renderer/i)
  assert.throws(() => compareRenderBaselines(baseline(), { ...candidate(), fixtureVersion: '' }), /fixture/i)
  for (const viewport of [
    { width: 0, height: 900, deviceScaleFactor: 1 },
    { width: 1440, height: Number.NaN, deviceScaleFactor: 1 },
    { width: 1440, height: 900, deviceScaleFactor: 0 },
  ]) assert.throws(() => compareRenderBaselines(baseline(), { ...candidate(), viewport }), /viewport/i)
  const wrongFixturePair = { baseline: baseline(), candidate: candidate() }
  wrongFixturePair.baseline.fixtureVersion = 'other.v1'
  wrongFixturePair.candidate.fixtureVersion = 'other.v1'
  assert.throws(() => compareRenderBaselines(wrongFixturePair.baseline, wrongFixturePair.candidate), /fixture/i)
  const wrongViewportPair = { baseline: baseline(), candidate: candidate() }
  wrongViewportPair.baseline.viewport.width = 1280
  wrongViewportPair.candidate.viewport.width = 1280
  assert.throws(() => compareRenderBaselines(wrongViewportPair.baseline, wrongViewportPair.candidate), /viewport/i)
})

test('rejects non-finite camera data and invalid presentation semantics', () => {
  const camera = candidate()
  camera.states.panorama.camera.target[1] = Number.NaN
  assert.throws(() => compareRenderBaselines(baseline(), camera), /camera/i)
  const distance = candidate()
  distance.states.panorama.camera.distance = 0
  assert.throws(() => compareRenderBaselines(baseline(), distance), /camera/i)
  const beta = candidate()
  beta.states.panorama.camera.beta = Math.PI
  assert.throws(() => compareRenderBaselines(baseline(), beta), /camera/i)
  const progress = candidate()
  progress.states['approach-midpoint'].presentation.approachProgress = 2
  assert.throws(() => compareRenderBaselines(baseline(), progress), /presentation/i)
  const panoramaFocus = candidate()
  panoramaFocus.states.panorama.presentation.focusedStarKey = 'unexpected'
  assert.throws(() => compareRenderBaselines(baseline(), panoramaFocus), /panorama.*focus/i)
  const focusedWithoutKey = candidate()
  focusedWithoutKey.states['focused-star'].presentation.focusedStarKey = null
  assert.throws(() => compareRenderBaselines(baseline(), focusedWithoutKey), /focused-star.*focus/i)
  const hiddenMidpointSystem = candidate()
  hiddenMidpointSystem.states['approach-midpoint'].presentation.systemReveal = 0
  assert.throws(() => compareRenderBaselines(baseline(), hiddenMidpointSystem), /approach-midpoint.*presentation/i)
  const hiddenFocusedPlanets = candidate()
  hiddenFocusedPlanets.states['focused-star'].presentation.visibleQuestionPlanets = 0
  assert.throws(() => compareRenderBaselines(baseline(), hiddenFocusedPlanets), /focused-star.*presentation/i)
})

test('always enforces a positive p95 and the relative 20 percent render-cost budget', () => {
  for (const p95FrameTime of [0, -1, Number.NaN]) {
    const value = candidate()
    value.performance.medium.p95FrameTime = p95FrameTime
    assert.throws(() => compareRenderBaselines(baseline(), value), /p95/i)
  }
  // 相对回归也必须比渲染开销：p95FrameTime 被 30fps 空闲节流钉死，两侧恒等，
  // 拿它比「基线 × 1.2」得到的是一条永远不会红的门禁。
  //
  // medium 基线的 p95 是 10ms，远高于 0.5ms 噪声下限，所以这里由 ×1.2 规则接管。
  const relative = candidate()
  relative.performance.medium.p95RenderCostMs = baseline().performance.medium.p95RenderCostMs * 1.21
  assert.equal(relative.performance.medium.p95FrameTime, baseline().performance.medium.p95FrameTime)
  assert.throws(() => compareRenderBaselines(baseline(), relative), /medium render cost regressed over 20%/i)

  // 峰值单独跳到 40 倍不改变判定 —— 那是单帧抖动，不是渲染开销回归。
  const spike = candidate()
  spike.performance.medium.maxRenderCostMs = baseline().performance.medium.p95RenderCostMs * 40
  assert.doesNotThrow(() => compareRenderBaselines(baseline(), spike))
})

test('enforces absolute budgets only for an explicit macOS Metal reference run', () => {
  const ordinaryBaseline = baseline()
  ordinaryBaseline.performance.medium.p95FrameTime = 25
  const ordinary = candidate()
  ordinary.performance.medium.p95FrameTime = 25
  assert.doesNotThrow(() => compareRenderBaselines(ordinaryBaseline, ordinary))

  // 参考机上超预算必须红。预算约束的是渲染开销（见下一条用例），
  // 所以这里推的是 maxRenderCostMs，不是被节流钉住的 p95FrameTime。
  const referenceBaseline = baseline()
  referenceBaseline.referenceDevice.enforceAbsoluteBudgets = true
  referenceBaseline.performance.medium = performanceState(16, 20, 10)
  const reference = candidate()
  reference.referenceDevice.enforceAbsoluteBudgets = true
  reference.performance.medium = performanceState(16, 20, 20.01)
  assert.throws(() => compareRenderBaselines(referenceBaseline, reference), /absolute.*medium/i)

  const invalidReference = candidate()
  invalidReference.referenceDevice = { enforceAbsoluteBudgets: true, platform: 'linux', graphicsBackend: 'swiftshader' }
  assert.throws(() => compareRenderBaselines(baseline(), invalidReference), /reference device/i)
})

test('measures the absolute budget against render cost, not the throttled scheduling interval', () => {
  // p95FrameTime 是**调度间隔**：30fps 空闲节流把它钉在 33–43ms，与这一屏
  // 到底画了多少东西无关。拿它去比「单帧渲染预算」，等于让节流策略决定
  // 性能门禁的成败 —— medium 的 20ms 预算于是永远不可能通过，
  // `MINDVERSE_REFERENCE_DEVICE=1` 这条路径从来没有真正跑绿过。
  //
  // 真正该被预算约束的是 maxRenderCostMs（最坏单帧的渲染开销），
  // 提升报告 §5.4 用的也正是这个数（medium 11.3ms / low 10.1ms）。
  const throttledBaseline = baseline()
  throttledBaseline.referenceDevice.enforceAbsoluteBudgets = true
  throttledBaseline.performance.medium = performanceState(43.0, 20, 10.0)
  throttledBaseline.performance.low = performanceState(43.1, 33.3, 9.0)
  const throttled = candidate()
  throttled.referenceDevice.enforceAbsoluteBudgets = true
  throttled.performance.medium = performanceState(43.2, 20, 11.3)
  throttled.performance.low = performanceState(42.9, 33.3, 10.1)
  assert.doesNotThrow(() => compareRenderBaselines(throttledBaseline, throttled))

  // 但真的画超预算了，必须红。
  const heavy = structuredClone(throttled)
  heavy.performance.medium = performanceState(43.2, 20, 20.01)
  assert.throws(() => compareRenderBaselines(throttledBaseline, heavy), /absolute.*medium/i)
})

test('rejects malformed performance metadata and sample windows', () => {
  for (const mutate of [
    (value) => { value.performance.medium.sampleCount = 0 },
    (value) => { value.performance.medium.starCount = 499 },
    (value) => { value.performance.medium.absoluteBudgetMs = 0 },
    (value) => { value.performance.medium.hardware = null },
    (value) => { delete value.performance.medium.hardware.userAgent },
    (value) => { value.performance.medium.hardware.hardwareConcurrency = 0 },
  ]) {
    const value = candidate()
    mutate(value)
    assert.throws(() => compareRenderBaselines(baseline(), value), /performance|sample|star count|hardware/i)
  }
})

test('validates every derived stellar PNG artifact as present, non-empty PNG data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mindverse-baseline-'))
  const json = join(directory, 'babylon-stellar-v1.json')
  const paths = deriveStellarPngPaths(json)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  try {
    await assert.rejects(validateStellarPngArtifacts(json), /missing.*PNG.*panorama/i)
    await Promise.all(Object.values(paths).map((path) => writeFile(path, signature)))
    await validateStellarPngArtifacts(json)
    await writeFile(paths.panorama, Buffer.alloc(0))
    await assert.rejects(validateStellarPngArtifacts(json), /empty.*PNG.*panorama/i)
    await writeFile(paths.panorama, Buffer.from('not a png file'))
    await assert.rejects(validateStellarPngArtifacts(json), /signature.*panorama/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

const PLANET_COLORS = {
  magma: [0.55, 0.16, 0.05], desert: [0.55, 0.38, 0.12], rock: [0.28, 0.29, 0.31],
  tundra: [0.22, 0.36, 0.34], ice: [0.24, 0.42, 0.62],
}
const PLANET_ROUGHNESS = { magma: 0.025, desert: 0.035, rock: 0.05, tundra: 0.065, ice: 0.08 }

const planetSample = (thermal, overrides = {}) => ({
  thermal,
  bodyDiameter: 260,
  dayNightContrast: 0.18,
  atmosphereEdgeRatio: 0.08,
  bloomHighlightRatio: thermal === 'magma' ? 0.035 : 0.008,
  colorVariance: 0.02,
  meanColor: PLANET_COLORS[thermal],
  roughnessContrast: PLANET_ROUGHNESS[thermal],
  ...overrides,
})

const planetBaseline = () => ({
  schemaVersion: 'babylon-planets-baseline.v1',
  fixtureVersion: 'planet-render-gate.v1',
  rendererKind: 'babylon',
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  samples: Object.fromEntries(['magma', 'desert', 'rock', 'tundra', 'ice'].map((name) => [name, planetSample(name)])),
  far: { thermal: 'ice', surfaceLevel: 'low', highPlanetCount: 0, highFrequencyDetail: false, silhouetteDrift: 0.004, lightAlignment: 0.2, lightDirectionFlip: -0.9 },
})

test('planet comparator gates day/night, atmosphere, bloom, material variation and far LOD', () => {
  assert.deepEqual(comparePlanetRenderBaselines(planetBaseline(), structuredClone(planetBaseline())).states,
    ['magma', 'desert', 'rock', 'tundra', 'ice', 'far'])
  for (const [mutate, message] of [
    [(value) => { value.samples.rock.dayNightContrast = 0.01 }, /day.?night/i],
    [(value) => { value.samples.ice.atmosphereEdgeRatio = 0 }, /atmosphere/i],
    [(value) => { value.samples.desert.bloomHighlightRatio = 0.2 }, /bloom/i],
    [(value) => { value.samples.tundra.colorVariance = 0 }, /variance/i],
    [(value) => { value.far.surfaceLevel = 'high' }, /far.*LOD/i],
    [(value) => { value.far.highPlanetCount = 1 }, /high.*mesh/i],
    [(value) => { value.far.silhouetteDrift = 0.08 }, /silhouette/i],
    [(value) => { value.far.lightAlignment = -0.1 }, /light/i],
    [(value) => { value.far.lightDirectionFlip = 0.1 }, /light.*flip/i],
  ]) {
    const value = planetBaseline()
    mutate(value)
    assert.throws(() => comparePlanetRenderBaselines(planetBaseline(), value), message)
  }
})

test('planet comparator preserves perceptible absolute gates', () => {
  for (const [mutate, message] of [
    [(value) => { value.samples.rock.dayNightContrast = 0.059 }, /day.?night/i],
    [(value) => { value.samples.ice.atmosphereEdgeRatio = 0.0049 }, /atmosphere/i],
    [(value) => { value.samples.rock.meanColor = [0.280, 0.290, 0.310]; value.samples.tundra.meanColor = [0.294, 0.290, 0.310] }, /rock\/tundra.*not distinguishable/i],
  ]) {
    const value = planetBaseline()
    mutate(value)
    assert.throws(() => comparePlanetRenderBaselines(planetBaseline(), value), message)
  }
})

test('derives isolated PNG paths for all planet samples', () => {
  const paths = derivePlanetPngPaths('/tmp/babylon-planets-candidate.json')
  assert.deepEqual(Object.keys(paths), ['magma', 'desert', 'rock', 'tundra', 'ice', 'far-a', 'far-b', 'far-flip'])
  assert.equal(paths.magma, '/tmp/babylon-planets-candidate-magma.png')
})

// ── Pixel-backed cross-renderer parity ──

const parityFrame = ({ width = 96, height = 54, wash = 0.09, star = null, tint = [1, 1, 1] } = {}) => {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = wash
      if (star) {
        const distance = Math.hypot(x - star.x, y - star.y) / star.radius
        if (distance <= 1) value = Math.max(value, star.core * Math.pow(1 - distance, star.falloff ?? 1.6))
      }
      const offset = (y * width + x) * 4
      data[offset] = Math.round(Math.min(1, value * tint[0]) * 255)
      data[offset + 1] = Math.round(Math.min(1, value * tint[1]) * 255)
      data[offset + 2] = Math.round(Math.min(1, value * tint[2]) * 255)
      data[offset + 3] = 255
    }
  }
  return { width, height, data }
}

const parityDescriptors = (overrides = {}) => Object.fromEntries(PARITY_STATE_NAMES.map((name, index) => [
  name,
  describeFrame(overrides[name] ?? parityFrame({
    star: { x: 30 + index * 6, y: 27, radius: 14 + index * 3, core: 0.95 },
  })),
]))

const parityDocument = (overrides = {}) => ({
  schemaVersion: 'mindverse-visual-parity.v1',
  fixtureVersion: 'strata-universe.v1',
  rendererKind: 'three',
  viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  states: Object.fromEntries(PARITY_STATE_NAMES.map((name) => [name, { captured: true }])),
  ...overrides,
})

test('derives one PNG artifact path per parity state', () => {
  const paths = deriveParityPngPaths('/tmp/three-parity-v1.json')
  assert.deepEqual(Object.keys(paths), ['panorama', 'focused-star', 'planet-focus'])
  assert.equal(paths.panorama, '/tmp/three-parity-v1-panorama.png')
  assert.equal(paths['planet-focus'], '/tmp/three-parity-v1-planet-focus.png')
})

test('validates every parity PNG artifact as present, non-empty PNG data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'mindverse-parity-'))
  const json = join(directory, 'three-parity-v1.json')
  const paths = deriveParityPngPaths(json)
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  try {
    await assert.rejects(validateParityPngArtifacts(json), /missing.*PNG.*panorama/i)
    await Promise.all(Object.values(paths).map((path) => writeFile(path, signature)))
    await validateParityPngArtifacts(json)
    await writeFile(paths['planet-focus'], Buffer.alloc(0))
    await assert.rejects(validateParityPngArtifacts(json), /empty.*PNG.*planet-focus/i)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('parity comparison refuses to reach a verdict without decoded pixels', () => {
  assert.throws(
    () => compareVisualParityDocuments(parityDocument(), parityDocument({ rendererKind: 'babylon' })),
    /decoded frames/i,
  )
})

test('parity comparison passes only when all three states match pixel-wise', () => {
  const frames = { reference: parityDescriptors(), candidate: parityDescriptors() }
  const result = compareVisualParityDocuments(
    parityDocument(), parityDocument({ rendererKind: 'babylon' }), frames,
  )
  assert.equal(result.parity, true)
  assert.deepEqual(result.states.map(({ name }) => name), PARITY_STATE_NAMES)
})

test('parity comparison reports the states whose pixels drifted', () => {
  const frames = {
    reference: parityDescriptors(),
    candidate: parityDescriptors({
      'planet-focus': parityFrame({ wash: 0, star: { x: 48, y: 27, radius: 26, core: 0.95, falloff: 0.1 } }),
    }),
  }
  assert.throws(
    () => compareVisualParityDocuments(parityDocument(), parityDocument({ rendererKind: 'babylon' }), frames),
    /planet-focus/,
  )
})

test('parity comparison enforces schema, fixture and viewport contracts', () => {
  const frames = { reference: parityDescriptors(), candidate: parityDescriptors() }
  for (const [overrides, message] of [
    [{ schemaVersion: 'other' }, /schema/i],
    [{ fixtureVersion: 'mismatched' }, /fixture/i],
    [{ viewport: { width: 800, height: 600, deviceScaleFactor: 1 } }, /viewport/i],
    [{ rendererKind: 'unknown' }, /renderer/i],
    [{ states: { panorama: { captured: true } } }, /focused-star/],
  ]) {
    assert.throws(
      () => compareVisualParityDocuments(parityDocument(), parityDocument({ rendererKind: 'babylon', ...overrides }), frames),
      message,
    )
  }
})

test('reports every drifted state instead of stopping at the first one', () => {
  const value = candidate()
  // 一次取景改动会同时波及多个状态。首个失败即抛会把「五处漂移」报成「一处」，
  // 让人误判成孤立噪声而不是系统性变化。
  value.states.panorama.camera.alpha = 2.5
  value.states['focused-star'].camera.alpha = 2.5

  let message = ''
  try { compareRenderBaselines(baseline(), value) } catch (error) { message = error.message }

  assert.match(message, /2 checks failed/)
  assert.match(message, /panorama/)
  assert.match(message, /focused-star/)
})

test('names the missing baseline file instead of surfacing a raw ENOENT', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'baseline-missing-'))
  try {
    await assert.rejects(
      () => readBaselineDocument(join(dir, 'babylon-planets-v1.json'), 'baseline'),
      /baseline file babylon-planets-v1\.json is missing/,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('names the unreadable baseline file when its JSON is corrupt', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'baseline-corrupt-'))
  try {
    const path = join(dir, 'candidate.json')
    await writeFile(path, '{ not json')
    await assert.rejects(
      () => readBaselineDocument(path, 'candidate'),
      /candidate file candidate\.json is not valid JSON/,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

const parityStates = (entries) => entries.map(([name, metrics]) => ({
  name,
  parity: metrics.length === 0,
  deviations: metrics.map((metric) => ({ metric, reference: 0, candidate: 1, delta: 1, allowed: 0.1 })),
}))

test('accepts exactly the documented parity failures and nothing else', () => {
  const states = parityStates([
    ['panorama', ['structure:tileMax', 'subject:centroid']],
    ['focused-star', []],
    ['planet-focus', ['coverage']],
  ])
  const manifest = {
    panorama: ['structure:tileMax', 'subject:centroid'],
    'planet-focus': ['coverage'],
  }
  assert.deepEqual(reconcileExpectedParityFailures(states, manifest), { unexpected: [], resolved: [] })
})

test('goes red on a drift that is not on the manifest', () => {
  const states = parityStates([
    ['panorama', ['structure:tileMax', 'chroma']],
    ['focused-star', []],
    ['planet-focus', []],
  ])
  const manifest = { panorama: ['structure:tileMax'] }
  assert.deepEqual(reconcileExpectedParityFailures(states, manifest), {
    unexpected: ['panorama/chroma'],
    resolved: [],
  })
})

test('goes red when a documented failure is fixed but left on the manifest', () => {
  const states = parityStates([['panorama', []], ['focused-star', []], ['planet-focus', []]])
  const manifest = { panorama: ['structure:tileMax'] }
  assert.deepEqual(reconcileExpectedParityFailures(states, manifest), {
    unexpected: [],
    resolved: ['panorama/structure:tileMax'],
  })
})

test('reports an unexpected drift in a state the manifest never mentions', () => {
  const states = parityStates([['panorama', []], ['focused-star', ['coverage']], ['planet-focus', []]])
  assert.deepEqual(reconcileExpectedParityFailures(states, {}), {
    unexpected: ['focused-star/coverage'],
    resolved: [],
  })
})

test('refuses the retired 2026-09-02 single-frame pair with a message that names its successor', () => {
  const legacy = {
    fixtureVersion: 'strata-universe.v1', rendererKind: 'three', viewport: { width: 1280, height: 720 },
    selectedPlanetBounds: { x: 400, y: 200, width: 200, height: 200 },
    nonBackgroundRatio: 0.4, firstInteractiveMs: 1_000, p95FrameTime: 10,
  }
  assert.throws(
    () => compareRenderBaselines(legacy, { ...legacy, rendererKind: 'babylon' }),
    /retired.*compare:visual-parity/is,
  )
})

test('the CLI budget judges the p95 of the window and tolerates timer quantisation', () => {
  // 与 src/starmap/renderBudget.ts 同口径：p95 而非峰值，且带 0.5ms 噪声下限。
  // 两侧口径不一致的话，同一份采集在 Playwright 里绿、在命令行里红。
  const withCost = (state, p95, max) => ({ ...state, p95RenderCostMs: p95, maxRenderCostMs: max })
  const reference = performanceState(43.0, 20, 1.2)
  const measured = performanceState(43.1, 20, 1.2)
  const baselineDoc = {
    ...baseline(),
    performance: {
      medium: withCost(reference, 1.2, 1.8),
      low: withCost(performanceState(43.1, 33.3, 1.2), 1.2, 1.8),
    },
  }
  const near = {
    ...candidate(),
    performance: {
      // 单帧抖动把峰值顶到 40，p95 只动一个量化步：不得判红。
      medium: withCost(measured, 1.6, 40),
      low: withCost(performanceState(43.1, 33.3, 1.2), 1.5, 38),
    },
  }
  assert.doesNotThrow(() => compareRenderBaselines(baselineDoc, near))

  const regressed = {
    ...near,
    performance: { ...near.performance, medium: withCost(measured, 2.4, 2.6) },
  }
  assert.throws(() => compareRenderBaselines(baselineDoc, regressed), /medium render cost regressed/i)
})

test('the CLI holds a first-interactive ceiling in place of the retired legacy pair', () => {
  const withStartup = (state, p95, ms) => ({
    ...state, p95RenderCostMs: p95, maxRenderCostMs: p95 * 2, firstInteractiveMs: ms,
  })
  const baselineDoc = {
    ...baseline(),
    performance: {
      medium: withStartup(performanceState(43.0, 20, 1.2), 1.2, 500),
      low: withStartup(performanceState(43.1, 33.3, 1.2), 1.2, 800),
    },
  }
  // 日常负载抖动（800 → 1700ms）不得判红：相对比对在这个量上分辨不出真回归。
  const jittery = {
    ...candidate(),
    performance: {
      medium: withStartup(performanceState(43.1, 20, 1.2), 1.2, 1_700),
      low: withStartup(performanceState(43.1, 33.3, 1.2), 1.2, 800),
    },
  }
  assert.doesNotThrow(() => compareRenderBaselines(baselineDoc, jittery))

  // 首屏卡住则必须红。
  const stalled = {
    ...candidate(),
    performance: {
      medium: withStartup(performanceState(43.1, 20, 1.2), 1.2, 3_400),
      low: withStartup(performanceState(43.1, 33.3, 1.2), 1.2, 800),
    },
  }
  assert.throws(() => compareRenderBaselines(baselineDoc, stalled), /medium first interactive exceeds/i)
})
