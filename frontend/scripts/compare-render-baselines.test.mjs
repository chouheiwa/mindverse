import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  compareRenderBaselines,
  comparePlanetRenderBaselines,
  derivePlanetPngPaths,
  deriveStellarPngPaths,
  validateStellarPngArtifacts,
} from './compare-render-baselines.mjs'

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

function performanceState(p95FrameTime, absoluteBudgetMs) {
  return {
    fixtureVersion: 'strata-universe.dense-500.v1', starCount: 500,
    p95FrameTime, absoluteBudgetMs, sampleCount: 600, warmupMs: 3_000, sampleWindowMs: 10_000,
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

test('always enforces a positive p95 and the relative 20 percent budget', () => {
  for (const p95FrameTime of [0, -1, Number.NaN]) {
    const value = candidate()
    value.performance.medium.p95FrameTime = p95FrameTime
    assert.throws(() => compareRenderBaselines(baseline(), value), /p95/i)
  }
  const relative = candidate()
  relative.performance.medium.p95FrameTime = 19.21
  assert.throws(() => compareRenderBaselines(baseline(), relative), /p95.*20%/i)
})

test('enforces absolute budgets only for an explicit macOS Metal reference run', () => {
  const ordinaryBaseline = baseline()
  ordinaryBaseline.performance.medium.p95FrameTime = 25
  const ordinary = candidate()
  ordinary.performance.medium.p95FrameTime = 25
  assert.doesNotThrow(() => compareRenderBaselines(ordinaryBaseline, ordinary))

  const referenceBaseline = baseline()
  referenceBaseline.referenceDevice.enforceAbsoluteBudgets = true
  referenceBaseline.performance.medium.p95FrameTime = 20
  const reference = candidate()
  reference.referenceDevice.enforceAbsoluteBudgets = true
  reference.performance.medium.p95FrameTime = 20.01
  assert.throws(() => compareRenderBaselines(referenceBaseline, reference), /absolute.*medium/i)

  const invalidReference = candidate()
  invalidReference.referenceDevice = { enforceAbsoluteBudgets: true, platform: 'linux', graphicsBackend: 'swiftshader' }
  assert.throws(() => compareRenderBaselines(baseline(), invalidReference), /reference device/i)
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

test('keeps the checked-in legacy migration comparison executable', () => {
  const legacy = {
    fixtureVersion: 'strata-universe.v1', rendererKind: 'three', viewport: { width: 1280, height: 720 },
    selectedPlanetBounds: { x: 400, y: 200, width: 200, height: 200 },
    nonBackgroundRatio: 0.4, firstInteractiveMs: 1_000, p95FrameTime: 10,
  }
  const migrated = { ...legacy, rendererKind: 'babylon' }
  assert.equal(compareRenderBaselines(legacy, migrated).rendererKind, 'babylon')
  assert.throws(() => compareRenderBaselines(legacy, { ...migrated, p95FrameTime: 12.01 }), /p95.*20%/i)
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
