import test from 'node:test'
import assert from 'node:assert/strict'
import { compareRenderBaselines } from './compare-render-baselines.mjs'

const STATE_NAMES = ['panorama', 'approach-midpoint', 'focused-star', 'planet-focus']

function state(overrides = {}) {
  return {
    corePixelDiameter: 8,
    haloPixelDiameter: 28,
    nonBackgroundRatio: 0.14,
    luminanceVariance: 0.018,
    clippedWhiteRatio: 0.002,
    camera: { distance: 20, alpha: 1, beta: 1, target: [0, 0, 0] },
    presentation: { focusedStarKey: null, approachProgress: 0, systemReveal: 0 },
    ...overrides,
  }
}

const baseline = () => ({
  schemaVersion: 'babylon-stellar-baseline.v1',
  fixtureVersion: 'strata-universe.v1',
  rendererKind: 'babylon',
  viewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  states: Object.fromEntries(STATE_NAMES.map((name) => [name, state()])),
  performance: {
    medium: { p95FrameTime: 16, absoluteBudgetMs: 20, sampleCount: 600 },
    low: { p95FrameTime: 24, absoluteBudgetMs: 33.3, sampleCount: 600 },
  },
})

const candidate = () => structuredClone(baseline())

test('accepts four stellar states and performance inside relative and absolute budgets', () => {
  const result = compareRenderBaselines(baseline(), candidate())
  assert.deepEqual(result.states, STATE_NAMES)
  assert.equal(result.rendererKind, 'babylon')
})

test('rejects a missing deterministic state', () => {
  const value = candidate()
  delete value.states['approach-midpoint']
  assert.throws(() => compareRenderBaselines(baseline(), value), /missing state.*approach-midpoint/i)
  const reference = baseline()
  delete reference.states['focused-star']
  assert.throws(() => compareRenderBaselines(reference, candidate()), /missing state.*focused-star/i)
})

test('rejects a point-only star radius', () => {
  const value = candidate()
  value.states.panorama = state({ corePixelDiameter: 4, haloPixelDiameter: 4.4 })
  assert.throws(() => compareRenderBaselines(baseline(), value), /point-only/i)
})

test('rejects black and blown-white frames', () => {
  const black = candidate()
  black.states.panorama = state({ nonBackgroundRatio: 0.0001, luminanceVariance: 0.000001 })
  assert.throws(() => compareRenderBaselines(baseline(), black), /black frame/i)
  const white = candidate()
  white.states['focused-star'] = state({ clippedWhiteRatio: 0.12 })
  assert.throws(() => compareRenderBaselines(baseline(), white), /blown-white/i)
})

test('rejects p95 over baseline by more than 20 percent', () => {
  const relative = candidate()
  relative.performance.medium.p95FrameTime = 19.21
  assert.throws(() => compareRenderBaselines(baseline(), relative), /p95.*20%/i)
})

test('rejects absolute medium and low budgets', () => {
  const mediumBaseline = baseline()
  mediumBaseline.performance.medium.p95FrameTime = 19
  const medium = candidate()
  medium.performance.medium.p95FrameTime = 20.01
  assert.throws(() => compareRenderBaselines(mediumBaseline, medium), /absolute.*medium/i)
  const lowBaseline = baseline()
  lowBaseline.performance.low.p95FrameTime = 32
  const low = candidate()
  low.performance.low.p95FrameTime = 33.31
  assert.throws(() => compareRenderBaselines(lowBaseline, low), /absolute.*low/i)
})

test('rejects schema, fixture, viewport, invalid metrics and short performance samples', () => {
  assert.throws(() => compareRenderBaselines({ ...baseline(), schemaVersion: 'old' }, candidate()), /schema/i)
  assert.throws(() => compareRenderBaselines(baseline(), { ...candidate(), fixtureVersion: 'v2' }), /fixture/i)
  assert.throws(() => compareRenderBaselines(baseline(), { ...candidate(), viewport: { width: 1, height: 1, deviceScaleFactor: 1 } }), /viewport/i)
  const invalid = candidate()
  invalid.states.panorama.corePixelDiameter = Number.NaN
  assert.throws(() => compareRenderBaselines(baseline(), invalid), /invalid/i)
  const short = candidate()
  short.performance.medium.sampleCount = 0
  assert.throws(() => compareRenderBaselines(baseline(), short), /sample/i)
})

test('keeps the checked-in migration pair comparable while enforcing the stricter 20 percent p95 gate', () => {
  const legacy = {
    fixtureVersion: 'strata-universe.v1', rendererKind: 'three', viewport: { width: 1280, height: 720 },
    selectedPlanetBounds: { x: 400, y: 200, width: 200, height: 200 },
    nonBackgroundRatio: 0.4, firstInteractiveMs: 1_000, p95FrameTime: 10,
  }
  const migrated = { ...legacy, rendererKind: 'babylon' }
  assert.equal(compareRenderBaselines(legacy, migrated).rendererKind, 'babylon')
  assert.throws(() => compareRenderBaselines(legacy, { ...migrated, p95FrameTime: 12.01 }), /p95.*20%/i)
})
