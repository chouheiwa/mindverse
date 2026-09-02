import test from 'node:test'
import assert from 'node:assert/strict'
import { compareRenderBaselines } from './compare-render-baselines.mjs'

const baseline = () => ({
  fixtureVersion: 'strata-universe.v1', rendererKind: 'three', viewport: { width: 1280, height: 720 },
  selectedPlanetBounds: { x: 400, y: 200, width: 200, height: 200 }, nonBackgroundRatio: 0.4,
  firstInteractiveMs: 1000, p95FrameTime: 10,
})
const candidate = () => ({ ...baseline(), rendererKind: 'babylon' })

test('accepts a candidate inside every migration budget', () =>
  assert.equal(compareRenderBaselines(baseline(), candidate()).rendererKind, 'babylon'))
test('rejects renderer, fixture and viewport mismatch', () => {
  assert.throws(() => compareRenderBaselines({ ...baseline(), rendererKind: 'babylon' }, candidate()), /Three baseline/)
  assert.throws(() => compareRenderBaselines(baseline(), { ...candidate(), fixtureVersion: 'v2' }), /fixture/)
  assert.throws(() => compareRenderBaselines(baseline(), { ...candidate(), viewport: { width: 1, height: 1 } }), /viewport/)
})
test('rejects p95 over 25% and first interactive over 30%', () => {
  assert.throws(() => compareRenderBaselines(baseline(), { ...candidate(), p95FrameTime: 12.51 }), /p95/)
  assert.throws(() => compareRenderBaselines(baseline(), { ...candidate(), firstInteractiveMs: 1301 }), /interactive/)
})
test('rejects center drift over 10% of short edge and occupancy drift over 20 points', () => {
  assert.throws(() => compareRenderBaselines(baseline(), { ...candidate(), selectedPlanetBounds: { x: 500, y: 200, width: 200, height: 200 } }), /center/)
  assert.throws(() => compareRenderBaselines(baseline(), { ...candidate(), nonBackgroundRatio: 0.61 }), /non-background/)
})
