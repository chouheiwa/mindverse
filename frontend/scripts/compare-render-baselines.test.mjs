import test from 'node:test'
import assert from 'node:assert/strict'
import { compareRenderBaselines } from './compare-render-baselines.mjs'

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
      deviceMemory: 8, gpuVendor: 'Apple', gpuRenderer: 'Apple M-series',
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
