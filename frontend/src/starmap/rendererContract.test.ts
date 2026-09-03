import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { describe, expect, test, vi } from 'vitest'
import type { Star, Universe } from '../types'
import type { StarDatum } from './gl/starData'
import { Renderer } from './Renderer'
import { BabylonRenderer } from './babylon/BabylonRenderer'
import { CameraFlightController } from './babylon/cameraFlight'
import { StellarPointerPresentationController } from './babylon/orbitPresentation'

const makeStar = (overrides: Partial<Star> = {}): Star => ({
  c: 'alpha', g: 1, p: [1, 2, 3], n: 3, o: 1, f: 0,
  hue: 0, sat: 0, pe: 1, bu: 0, fi: '', la: '', ev: [], ...overrides,
})

const makeUniverse = (stars: Star[]): Universe => ({
  meta: { items: 1, concepts: 1, clusters: 1, own: 1, fav: 0, span: [0, 0], medz: 0, p10z: 0, source: '', splits: 0 },
  clusters: [], stars, particles: [], wormholes: [], solo: [], dark: [], nebula: [],
}) as Universe

const makeDatum = (s: Star, overrides: Partial<StarDatum> = {}): StarDatum => ({
  s, p: [...s.p], center: [0, 0, 0], axis: [0, 1, 0], period: 0, start: [0, 0, 0], ignite: 0,
  pointSize: 4, bodyR: 1, bright: 1, burst: 0, seed: 1, rot: 0, color: [1, 1, 1], kelvin: 5000,
  sysAxis: [0, 1, 0], sysU: [1, 0, 0], sysV: [0, 0, 1], ...overrides,
})

type RendererHarness = Record<string, any> & { focusStar(starKey: string): Star | null }

function threeHarness(stars: StarDatum[], callbacks: { onPick?: (star: Star | null) => void }): RendererHarness {
  const renderer = Object.create(Renderer.prototype) as RendererHarness
  renderer.destroyed = false
  renderer.unsupportedStrataRequest = null
  renderer.allStarData = stars
  renderer.mode = 'all'
  renderer.wormIdx = 0
  renderer.u = makeUniverse(stars.map(({ s }) => s))
  renderer.clearPlanet = vi.fn()
  renderer.applyFocus = vi.fn()
  renderer.cb = callbacks
  renderer.targetDist = 0
  renderer.retarget = false
  return renderer
}

function babylonHarness(stars: StarDatum[], callbacks: { onPick?: (star: Star | null) => void }): RendererHarness {
  const renderer = Object.create(BabylonRenderer.prototype) as RendererHarness
  renderer.destroyed = false
  renderer.universeVisible = true
  renderer.strataTransition = { phase: null }
  renderer.stars = stars
  renderer.mode = 'all'
  renderer.wormIdx = 0
  renderer.universe = makeUniverse(stars.map(({ s }) => s))
  renderer.applyStarFocus = vi.fn()
  renderer.callbacks = callbacks
  return renderer
}

describe.each([
  ['Three', threeHarness],
  ['Babylon', babylonHarness],
] as const)('%s stellar focus behavior', (_name, harness) => {
  test('returns the exact domain star and emits one callback on successful focus', () => {
    const modern = makeStar({
      id: 'public:alpha', scope: 'public', externalQueryAllowed: true, questionIds: [], probeIds: [],
    })
    const datum = makeDatum(modern)
    const onPick = vi.fn()
    const renderer = harness([datum], { onPick })

    expect(renderer.focusStar('public:alpha')).toBe(modern)
    expect(renderer.applyStarFocus ?? renderer.applyFocus).toHaveBeenCalledOnce()
    expect(onPick).toHaveBeenCalledOnce()
    expect(onPick).toHaveBeenCalledWith(modern)
  })

  test('unknown and modern concept-fallback keys leave state and callbacks untouched', () => {
    const modern = makeStar({
      id: 'private:alpha', scope: 'private', externalQueryAllowed: false, questionIds: [], probeIds: [],
    })
    const onPick = vi.fn()
    const renderer = harness([makeDatum(modern)], { onPick })

    expect(renderer.focusStar('missing')).toBeNull()
    expect(renderer.focusStar('alpha')).toBeNull()
    expect(renderer.applyStarFocus ?? renderer.applyFocus).not.toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })

  test('destroyed, strata-hidden, and mode-hidden requests are no-ops', () => {
    const legacy = makeStar({ o: 0 })
    const onPick = vi.fn()
    const renderer = harness([makeDatum(legacy)], { onPick })

    renderer.destroyed = true
    expect(renderer.focusStar('alpha')).toBeNull()
    renderer.destroyed = false
    if (_name === 'Three') renderer.unsupportedStrataRequest = { token: 1, questionId: 'q' }
    else renderer.strataTransition.phase = 'strata-free'
    expect(renderer.focusStar('alpha')).toBeNull()
    if (_name === 'Three') renderer.unsupportedStrataRequest = null
    else renderer.strataTransition.phase = null
    renderer.mode = 'me'
    expect(renderer.focusStar('alpha')).toBeNull()
    expect(renderer.applyStarFocus ?? renderer.applyFocus).not.toHaveBeenCalled()
    expect(onPick).not.toHaveBeenCalled()
  })
})

function recoveryHarness(star: StarDatum, onRenderError: (error: Error) => void): RendererHarness {
  const renderer = Object.create(BabylonRenderer.prototype) as RendererHarness
  renderer.destroyed = false
  renderer.selected = null
  renderer.selectedVisual = null
  renderer.focusedStar = null
  renderer.planets = []
  renderer.elapsedMs = 0
  renderer.reducedMotion = true
  renderer.overviewTarget = new Vector3(Number.NaN, 4, 5)
  renderer.overviewRadius = Number.NaN
  renderer.camera = {
    target: Vector3.Zero(),
    radius: 20,
    setTarget(target: Vector3) { this.target = target.clone() },
  }
  renderer.cameraFlightController = new CameraFlightController()
  renderer.pointerPresentation = new StellarPointerPresentationController()
  renderer.canvas = { style: { cursor: '' } }
  renderer.starLayer = { setFocus: vi.fn(), setPresentation: vi.fn() }
  renderer.callbacks = { onRenderError }
  renderer.hoverKey = 'hover'
  renderer.pressedKey = 'pressed'
  renderer.presentation = { phase: 'approach', systemReveal: 0 }
  renderer.activeFlight = null
  renderer.isInteractive = vi.fn(() => true)
  renderer.syncOrbitPresentation = vi.fn()
  renderer.clearPlanet = vi.fn()
  renderer.currentStarPosition = () => new Vector3(...star.p)
  return renderer
}

describe('Babylon camera recovery behavior', () => {
  test.each<[
    string,
    { cameraRadius?: number; bodyR?: number; orbitR?: number },
  ]>([
    ['invalid pose', { cameraRadius: Number.NaN }],
    ['invalid body', { bodyR: Number.NaN }],
    ['invalid system', { orbitR: Number.NaN }],
  ])('%s construction reports once, cancels, and settles into finite state', (_name, corruption) => {
    const domainStar = makeStar()
    const datum = makeDatum(domainStar, { bodyR: corruption.bodyR ?? 1 })
    const onRenderError = vi.fn()
    const renderer = recoveryHarness(datum, onRenderError)
    if (corruption.cameraRadius !== undefined) renderer.camera.radius = corruption.cameraRadius
    if (corruption.orbitR !== undefined) {
      renderer.planets = [{ star: datum, orbitR: corruption.orbitR, radius: 0.2 }]
    }

    renderer.applyStarFocus(datum)

    expect(onRenderError).toHaveBeenCalledOnce()
    expect(onRenderError.mock.calls[0]?.[0]).toBeInstanceOf(Error)
    expect(renderer.cameraFlightController.isActive(1)).toBe(false)
    expect([renderer.camera.target.x, renderer.camera.target.y, renderer.camera.target.z, renderer.camera.radius]
      .every(Number.isFinite)).toBe(true)
  })

  test('invalid focused world position clears focus and restores a synchronized safe panorama', () => {
    const datum = makeDatum(makeStar({ p: [Number.NaN, 2, 3] }))
    const original = new Error('original invalid focus')
    const onRenderError = vi.fn()
    const renderer = recoveryHarness(datum, onRenderError)
    renderer.focusedStar = datum

    renderer.recoverCamera(original)

    expect(onRenderError).toHaveBeenCalledOnce()
    expect(onRenderError).toHaveBeenCalledWith(original)
    expect(renderer.focusedStar).toBeNull()
    expect(renderer.presentation).toMatchObject({ lodIntent: 'point', systemReveal: 0 })
    expect(renderer.starLayer.setFocus).toHaveBeenCalledWith(null, null)
    expect(renderer.starLayer.setPresentation).toHaveBeenCalledOnce()
    expect(renderer.syncOrbitPresentation).toHaveBeenCalledOnce()
    expect(renderer.hoverKey).toBeNull()
    expect(renderer.pressedKey).toBeNull()
    expect(renderer.camera.target.equals(Vector3.Zero())).toBe(true)
    expect(Number.isFinite(renderer.camera.radius) && renderer.camera.radius > 0).toBe(true)
  })

  test('secondary presentation failure cannot replace or duplicate the original recovery error', () => {
    const datum = makeDatum(makeStar({ p: [Number.NaN, 2, 3] }))
    const original = new Error('original camera failure')
    const onRenderError = vi.fn()
    const renderer = recoveryHarness(datum, onRenderError)
    renderer.focusedStar = datum
    renderer.starLayer.setFocus = vi.fn(() => { throw new Error('secondary sync failure') })

    expect(() => renderer.recoverCamera(original)).not.toThrow()
    expect(onRenderError).toHaveBeenCalledOnce()
    expect(onRenderError).toHaveBeenCalledWith(original)
  })
})
