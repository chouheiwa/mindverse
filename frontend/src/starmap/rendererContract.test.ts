import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Viewport } from '@babylonjs/core/Maths/math.viewport.js'
import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import type { Star, Universe } from '../types'
import { starData, type StarDatum } from './gl/starData'
import { Renderer } from './Renderer'
import * as babylonRendererModule from './babylon/BabylonRenderer'
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
  renderer.applyStarFocus = vi.fn((datum: StarDatum) => {
    renderer.focusedStar = datum
    return true
  })
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
    expect(renderer.focusedStar).toBe(datum)
    expect(onPick).toHaveBeenCalledOnce()
    expect(onPick).toHaveBeenCalledWith(modern)
  })

  test('focuses a legacy concept key with the exact domain star and one callback', () => {
    const legacy = makeStar()
    const datum = makeDatum(legacy)
    const onPick = vi.fn()
    const renderer = harness([datum], { onPick })

    expect(renderer.focusStar('alpha')).toBe(legacy)
    expect(renderer.focusedStar).toBe(datum)
    expect(renderer.applyStarFocus ?? renderer.applyFocus).toHaveBeenCalledOnce()
    expect(onPick).toHaveBeenCalledOnce()
    expect(onPick).toHaveBeenCalledWith(legacy)
  })

  test('duplicate focus is a true no-op with no repeated callback or pose change', () => {
    const star = makeStar()
    const datum = makeDatum(star)
    const onPick = vi.fn()
    const renderer = harness([datum], { onPick })
    renderer.selected = null

    expect(renderer.focusStar('alpha')).toBe(star)
    const applyFocus = renderer.applyStarFocus ?? renderer.applyFocus
    const clearCount = _name === 'Three' ? renderer.clearPlanet.mock.calls.length : 0
    if (_name === 'Three') {
      renderer.targetDist = 73
      renderer.retarget = false
    }

    expect(renderer.focusStar('alpha')).toBe(star)
    expect(applyFocus).toHaveBeenCalledOnce()
    expect(onPick).toHaveBeenCalledOnce()
    if (_name === 'Three') {
      expect(renderer.clearPlanet).toHaveBeenCalledTimes(clearCount)
      expect(renderer.targetDist).toBe(73)
      expect(renderer.retarget).toBe(false)
    }
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
  renderer.visualByQuestion = new Map()
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
  renderer.starPositionScratch = new Vector3()
  renderer.flightTargetScratch = new Vector3()
  renderer.planetStarPositionScratch = new Vector3()
  renderer.candidateWorldScratch = new Vector3()
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
  test('destroy clears a diagnostic freeze before fallible cleanup begins', () => {
    const renderer = Object.create(BabylonRenderer.prototype) as RendererHarness
    renderer.destroyed = false
    renderer.diagnosticApproachProgressOverride = 0.65
    renderer.selected = null
    renderer.selectedVisual = null
    renderer.cancelFlight = vi.fn(() => { throw new Error('cleanup failed') })

    expect(() => renderer.destroy()).toThrow('cleanup failed')
    expect(renderer.destroyed).toBe(true)
    expect(renderer.diagnosticApproachProgressOverride).toBeNull()
  })

  test('E2E approach control freezes an exact deterministic camera frame until released', () => {
    vi.stubEnv('VITE_E2E_DIAGNOSTICS', '1')
    try {
      const datum = makeDatum(makeStar())
      const renderer = recoveryHarness(datum, vi.fn())
      renderer.reducedMotion = false
      renderer.focusedStar = datum
      renderer.overviewRadius = 30
      renderer.diagnosticApproachProgressOverride = null
      const started = renderer.cameraFlightController.start({
        starKey: 'alpha',
        start: { target: Vector3.Zero(), radius: 30 },
        targetStar: new Vector3(...datum.p),
        bodyR: datum.bodyR,
        systemExtent: 6,
        overviewRadius: 30,
        distance: 4,
        requestedMs: 1_100,
        reducedMotion: false,
      })
      if (started.kind !== 'started') throw new Error('expected camera flight')
      renderer.activeFlight = { flight: started.flight, elapsedMs: 100 }
      renderer.elapsedMs = 999

      expect(renderer.setDiagnosticApproachProgress(0.65)).toBe(true)
      expect(renderer.elapsedMs).toBe(0)
      expect(renderer.activeFlight.elapsedMs).toBeCloseTo(started.flight.durationMs * 0.65, 8)
      expect(renderer.presentation.systemReveal).toBeGreaterThan(0)
      const frozen = { radius: renderer.camera.radius, target: renderer.camera.target.clone() }
      renderer.updateCameraFlight(250)
      expect(renderer.activeFlight.elapsedMs).toBeCloseTo(started.flight.durationMs * 0.65, 8)
      expect(renderer.camera.radius).toBeCloseTo(frozen.radius, 8)
      expect(renderer.camera.target.equalsWithEpsilon(frozen.target, 1e-8)).toBe(true)
      expect(renderer.motionTime()).toBe(0)

      expect(renderer.setDiagnosticApproachProgress(null)).toBe(true)
      renderer.updateCameraFlight(100)
      expect(renderer.activeFlight.elapsedMs).toBeGreaterThan(started.flight.durationMs * 0.65)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  test.each(['invalid-frame', 'camera-pose'] as const)(
    'a frozen %s recovery clears the diagnostic clock override',
    (failure) => {
      const datum = makeDatum(makeStar())
      const renderer = recoveryHarness(datum, vi.fn())
      renderer.reducedMotion = false
      renderer.elapsedMs = 42
      renderer.diagnosticApproachProgressOverride = 0.65
      renderer.overviewTarget = Vector3.Zero()
      renderer.overviewRadius = 30
      renderer.focusedStar = null
      renderer.activeFlight = {
        flight: {
          token: 1,
          starKey: 'alpha',
          from: { target: { x: 0, y: 0, z: 0 }, radius: 30 },
          to: { target: { x: 1, y: 2, z: 3 }, radius: 8 },
          durationMs: 1_000,
        },
        elapsedMs: 650,
      }
      const cancel = vi.fn()
      renderer.cameraFlightController = {
        cancel,
        frame: failure === 'invalid-frame'
          ? vi.fn(() => ({ ok: false, error: 'invalid-frame' }))
          : vi.fn(() => ({
              ok: true,
              frame: { token: 1, target: { x: 1, y: 2, z: 3 }, radius: 8, progress: 0.65, complete: false },
            })),
      }
      if (failure === 'camera-pose') {
        renderer.camera.setTarget = vi.fn()
          .mockImplementationOnce(() => { throw new Error('camera pose failed') })
          .mockImplementation((target: Vector3) => { renderer.camera.target = target.clone() })
      }

      renderer.updateCameraFlight(16)

      expect(renderer.diagnosticApproachProgressOverride).toBeNull()
      expect(renderer.activeFlight).toBeNull()
      expect(cancel).toHaveBeenCalledWith('reset')
      expect(renderer.motionTime()).toBe(42)
      renderer.elapsedMs += 16
      expect(renderer.motionTime()).toBe(58)
    },
  )

  test('camera diagnostic sequence stays monotonic after the 180-sample window shifts', () => {
    vi.stubEnv('VITE_E2E_DIAGNOSTICS', '1')
    try {
      const renderer = recoveryHarness(makeDatum(makeStar()), vi.fn())
      renderer.diagnosticCameraSamples = []
      renderer.diagnosticCameraSequence = 0
      for (let index = 0; index < 185; index += 1) {
        renderer.camera.radius = 30 - index / 100
        renderer.recordDiagnosticCameraSample()
      }
      expect(renderer.diagnosticCameraSamples).toHaveLength(180)
      expect(renderer.diagnosticCameraSamples[0].sequence).toBe(5)
      expect(renderer.diagnosticCameraSamples.at(-1).sequence).toBe(184)
      expect(new Set(renderer.diagnosticCameraSamples.map(({ sequence }: { sequence: number }) => sequence)).size)
        .toBe(180)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  test('public focus reports success only when the requested focus remains established', () => {
    const datum = makeDatum(makeStar(), { bodyR: Number.NaN })
    const onPick = vi.fn()
    const onRenderError = vi.fn()
    const renderer = recoveryHarness(datum, onRenderError)
    renderer.stars = [datum]
    renderer.universe = makeUniverse([datum.s])
    renderer.mode = 'all'
    renderer.wormIdx = 0
    renderer.universeVisible = true
    renderer.strataTransition = { phase: null }
    renderer.callbacks = { onPick, onRenderError }

    expect(renderer.focusStar('alpha')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
    expect(onRenderError).toHaveBeenCalledOnce()
    expect(renderer.focusedStar).toBeNull()
  })

  test('public focus reports failure when recovery cannot restore the focused camera pose', () => {
    const datum = makeDatum(makeStar())
    const onPick = vi.fn()
    const onRenderError = vi.fn()
    const renderer = recoveryHarness(datum, onRenderError)
    renderer.stars = [datum]
    renderer.universe = makeUniverse([datum.s])
    renderer.mode = 'all'
    renderer.wormIdx = 0
    renderer.universeVisible = true
    renderer.strataTransition = { phase: null }
    renderer.callbacks = { onPick, onRenderError }
    renderer.overviewTarget = Vector3.Zero()
    renderer.overviewRadius = 30
    renderer.starLayer.setFocus = vi.fn()
      .mockImplementationOnce(() => { throw new Error('initial focus failed') })
    renderer.camera.setTarget = vi.fn(() => { throw new Error('camera recovery failed') })

    expect(renderer.focusStar('alpha')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
    expect(renderer.focusedStar).toBeNull()
  })

  test('a thrown current-star-position cause uses one recovery path and restores a finite panorama', () => {
    const datum = makeDatum(makeStar())
    const original = new Error('position preflight failed')
    const onRenderError = vi.fn()
    const renderer = recoveryHarness(datum, onRenderError)
    renderer.currentStarPosition = vi.fn(() => { throw original })

    expect(() => renderer.applyStarFocus(datum)).not.toThrow()

    expect(onRenderError).toHaveBeenCalledOnce()
    expect(onRenderError).toHaveBeenCalledWith(original)
    expect(renderer.focusedStar).toBeNull()
    expect(renderer.cameraFlightController.isActive(1)).toBe(false)
    expect([renderer.camera.target.x, renderer.camera.target.y, renderer.camera.target.z, renderer.camera.radius]
      .every(Number.isFinite)).toBe(true)
  })

  test('a thrown StarLayer focus cause is reported once and resynchronized to a legal focus', () => {
    const datum = makeDatum(makeStar())
    const original = new Error('star-layer preflight failed')
    const onRenderError = vi.fn()
    const renderer = recoveryHarness(datum, onRenderError)
    renderer.overviewTarget = Vector3.Zero()
    renderer.overviewRadius = 30
    renderer.starLayer.setFocus = vi.fn()
      .mockImplementationOnce(() => { throw original })

    expect(renderer.applyStarFocus(datum)).toBe(false)

    expect(onRenderError).toHaveBeenCalledOnce()
    expect(onRenderError).toHaveBeenCalledWith(original)
    expect(renderer.focusedStar).toBe(datum)
    expect(renderer.starLayer.setFocus).toHaveBeenLastCalledWith('alpha', datum)
    expect(renderer.starLayer.setPresentation).toHaveBeenCalledOnce()
    expect(renderer.syncOrbitPresentation).toHaveBeenCalledOnce()
    expect([renderer.camera.target.x, renderer.camera.target.y, renderer.camera.target.z, renderer.camera.radius]
      .every(Number.isFinite)).toBe(true)
  })

  test('public focus reports failure when recovery retains the requested star', () => {
    const datum = makeDatum(makeStar())
    const onPick = vi.fn()
    const renderer = recoveryHarness(datum, vi.fn())
    renderer.stars = [datum]
    renderer.universe = makeUniverse([datum.s])
    renderer.mode = 'all'; renderer.wormIdx = 0; renderer.universeVisible = true
    renderer.strataTransition = { phase: null }
    renderer.callbacks = { onPick }
    renderer.overviewTarget = Vector3.Zero(); renderer.overviewRadius = 30
    renderer.starLayer.setFocus = vi.fn()
      .mockImplementationOnce(() => { throw new Error('initial focus failed') })

    expect(renderer.focusStar('alpha')).toBeNull()
    expect(renderer.focusedStar).toBe(datum)
    expect(onPick).not.toHaveBeenCalled()
  })

  test('a thrown flight-controller cause is reported once and invalidates the token', () => {
    const datum = makeDatum(makeStar())
    const original = new Error('controller preflight failed')
    const onRenderError = vi.fn()
    const renderer = recoveryHarness(datum, onRenderError)
    renderer.overviewTarget = Vector3.Zero()
    renderer.overviewRadius = 30
    const cancel = vi.fn()
    renderer.cameraFlightController = {
      start: vi.fn(() => { throw original }),
      cancel,
    }

    expect(() => renderer.applyStarFocus(datum)).not.toThrow()

    expect(onRenderError).toHaveBeenCalledOnce()
    expect(onRenderError).toHaveBeenCalledWith(original)
    expect(cancel).toHaveBeenCalledOnce()
    expect(renderer.activeFlight).toBeNull()
    expect([renderer.camera.target.x, renderer.camera.target.y, renderer.camera.target.z, renderer.camera.radius]
      .every(Number.isFinite)).toBe(true)
  })

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

describe('Babylon stellar motion runtime', () => {
  test('planet bookkeeping preserves canonical star identity through framing and mode changes', () => {
    const privateStar = makeStar({
      id: 'star:private', scope: 'private', externalQueryAllowed: false,
      questionIds: ['question:private'], probeIds: [], c: 'shared', o: 1,
    })
    const publicStar = makeStar({
      id: 'star:public', scope: 'public', externalQueryAllowed: true,
      questionIds: ['question:public'], probeIds: [], c: 'shared', o: 0,
    })
    const questions = [
      { id: 'question:private', questionId: 'private', title: 'Private', url: 'https://example.test/private', answerIds: [] },
      { id: 'question:public', questionId: 'public', title: 'Public', url: 'https://example.test/public', answerIds: [] },
    ]
    const universe = {
      ...makeUniverse([privateStar, publicStar]),
      schemaVersion: 'universe.v1', analysisVersion: 'engine.v1', questions, answers: [], probes: [],
    } as any
    const index = {
      universe,
      starsById: new Map([['star:private', privateStar], ['star:public', publicStar]]),
      questionsById: new Map(questions.map((question) => [question.id, question])),
      answersById: new Map(), probesById: new Map(),
    } as any
    const canonicalStars = starData(universe)
    const planets = babylonRendererModule.buildPlanetBookkeeping(index, canonicalStars)

    expect(planets.map(({ star }) => star)).toEqual([canonicalStars[0], canonicalStars[1]])
    expect(planets[0]?.star).toBe(canonicalStars[0])
    expect(planets[1]?.star).toBe(canonicalStars[1])

    const renderer = Object.create(BabylonRenderer.prototype) as RendererHarness
    renderer.destroyed = false; renderer.planets = planets; renderer.stars = canonicalStars
    renderer.universe = universe; renderer.mode = 'all'; renderer.wormIdx = 0
    renderer.overviewRadius = 300; renderer.interactionByDatum = new Map()
    renderer.visualByQuestion = new Map(); renderer.selected = null; renderer.selectedVisual = null
    renderer.focusedStar = null; renderer.hoverKey = null
    renderer.starLayer = { setFocus: vi.fn(), setDimensions: vi.fn() }
    renderer.cameraFlightController = { cancel: vi.fn() }
    renderer.callbacks = {}; renderer.syncOrbitPresentation = vi.fn()
    renderer.resetView = vi.fn(() => { renderer.focusedStar = null })

    const expectedExtent = planets[0]!.orbitR + planets[0]!.radius
    expect(renderer.systemFraming(canonicalStars[0]).extent).toBeCloseTo(expectedExtent)
    expect(renderer.selectQuestionPlanet('star:private', 'question:private')?.star).toBe(canonicalStars[0])
    renderer.setMode('me', 0)
    expect(renderer.resetView).not.toHaveBeenCalled()
    expect(renderer.focusedStar).toBe(canonicalStars[0])
  })

  test('projects pointer candidates into retained caller-owned output', () => {
    const renderer = Object.create(BabylonRenderer.prototype) as RendererHarness
    renderer.engine = { getRenderWidth: () => 200, getRenderHeight: () => 100 }
    renderer.camera = { viewport: new Viewport(0, 0, 1, 1) }
    renderer.scene = { getTransformMatrix: () => Matrix.Identity() }
    renderer.canvas = { getBoundingClientRect: () => ({ width: 400, height: 200 }) }
    renderer.projectionIdentity = Matrix.Identity()
    renderer.projectionViewport = new Viewport(0, 0, 1, 1)
    renderer.projectedPositionScratch = new Vector3()
    const output = { x: 0, y: 0, z: 0 }

    expect(renderer.projectToCssToRef(Vector3.Zero(), output)).toBe(output)
    expect([output.x, output.y, output.z].every(Number.isFinite)).toBe(true)
  })

  test('Escape during approach cancels the flight and exits to a safe panorama', () => {
    const source = readFileSync('src/starmap/babylon/BabylonRenderer.ts', 'utf8')
    expect(source).toMatch(/event\.key === 'Escape'[\s\S]*this\.exitHierarchy\(\)/)
    const datum = makeDatum(makeStar())
    const onPick = vi.fn()
    const renderer = recoveryHarness(datum, vi.fn())
    const cancel = vi.fn()
    renderer.callbacks = { onPick }
    renderer.workspaceOpen = false
    renderer.universeVisible = true
    renderer.focusedStar = datum
    renderer.overviewTarget = new Vector3(4, 5, 6)
    renderer.overviewRadius = 80
    renderer.activeFlight = {
      flight: { token: 3, starKey: 'alpha', from: { target: { x: 0, y: 0, z: 0 }, radius: 100 },
        to: { target: { x: 1, y: 2, z: 3 }, radius: 20 }, durationMs: 1000 },
      elapsedMs: 200,
    }
    renderer.cameraFlightController = { cancel }

    renderer.exitHierarchy()

    expect(cancel).toHaveBeenCalledWith('reset')
    expect(renderer.activeFlight).toBeNull()
    expect(renderer.focusedStar).toBeNull()
    expect(renderer.camera.target.asArray()).toEqual([4, 5, 6])
    expect(renderer.camera.radius).toBe(80)
    expect(onPick).toHaveBeenCalledWith(null)
  })

  test('rebases approach frames onto the live star without changing progress or logarithmic radius', () => {
    const datum = makeDatum(makeStar())
    const renderer = recoveryHarness(datum, vi.fn())
    const flight = {
      token: 1,
      starKey: 'alpha',
      from: { target: { x: 0, y: 0, z: 0 }, radius: 100 },
      to: { target: { x: 10, y: 0, z: 0 }, radius: 25 },
      durationMs: 100,
    }
    renderer.focusedStar = datum
    renderer.activeFlight = { flight, elapsedMs: 0 }
    renderer.cameraFlightController = {
      frame: vi.fn((_flight: unknown, elapsedMs: number) => {
        const progress = Math.min(1, elapsedMs / 100)
        const eased = progress * progress * (3 - 2 * progress)
        return { ok: true, frame: {
          token: 1, progress, complete: progress === 1,
          target: { x: 10 * eased, y: 0, z: 0 },
          radius: Math.exp(Math.log(100) + (Math.log(25) - Math.log(100)) * eased),
        } }
      }),
    }
    renderer.currentStarPosition = vi.fn(() => new Vector3(30, 6, -3))

    renderer.updateCameraFlight(50)
    expect(renderer.camera.target.asArray()).toEqual([15, 3, -1.5])
    expect(renderer.camera.radius).toBeCloseTo(50)
    expect(renderer.activeFlight.elapsedMs).toBe(50)

    renderer.updateCameraFlight(50)
    expect(renderer.camera.target.asArray()).toEqual([30, 6, -3])
    expect(renderer.camera.radius).toBeCloseTo(25)
    expect(renderer.activeFlight).toBeNull()
  })

  test('live Reduced Motion propagates to StarLayer and settles an active flight at the live target', () => {
    const datum = makeDatum(makeStar())
    const renderer = recoveryHarness(datum, vi.fn())
    const cancel = vi.fn()
    renderer.reducedMotion = false
    renderer.elapsedMs = 2500
    renderer.focusedStar = datum
    renderer.activeFlight = {
      flight: { token: 2, starKey: 'alpha', from: { target: { x: 0, y: 0, z: 0 }, radius: 40 },
        to: { target: { x: 10, y: 0, z: 0 }, radius: 18 }, durationMs: 1000 },
      elapsedMs: 400,
    }
    renderer.cameraFlightController = { cancel }
    renderer.starLayer.setReducedMotion = vi.fn()
    renderer.currentStarPosition = (BabylonRenderer.prototype as any).currentStarPosition

    renderer.setReducedMotion(true)
    expect(renderer.starLayer.setReducedMotion).toHaveBeenCalledWith(true)
    expect(cancel).toHaveBeenCalledWith('user')
    expect(renderer.activeFlight).toBeNull()
    expect(renderer.camera.target.asArray()).toEqual(datum.p)
    expect(renderer.camera.radius).toBe(18)

    renderer.setReducedMotion(false)
    expect(renderer.starLayer.setReducedMotion).toHaveBeenLastCalledWith(false)
    expect(renderer.currentStarPosition(datum).asArray()).not.toEqual(datum.p)
  })

  test('live Reduced Motion immediately keeps an idle focused camera on the same CPU motion formula', () => {
    const datum = makeDatum(makeStar())
    const renderer = recoveryHarness(datum, vi.fn())
    renderer.reducedMotion = false
    renderer.elapsedMs = 2500
    renderer.focusedStar = datum
    renderer.activeFlight = null
    renderer.universeVisible = true
    renderer.starLayer.setReducedMotion = vi.fn()
    renderer.currentStarPosition = (BabylonRenderer.prototype as any).currentStarPosition
    renderer.camera.setTarget(renderer.currentStarPosition(datum))
    const animated = renderer.camera.target.clone()

    renderer.setReducedMotion(true)
    expect(renderer.camera.target.asArray()).toEqual(datum.p)

    renderer.setReducedMotion(false)
    expect(renderer.camera.target.asArray()).toEqual(animated.asArray())
  })

  test('stable star-focus frames reuse presentation state and avoid StarLayer presentation calls', () => {
    const datum = makeDatum(makeStar())
    const renderer = recoveryHarness(datum, vi.fn())
    renderer.focusedStar = datum
    renderer.presentation = { ...renderer.presentation }
    renderer.hoverKey = null
    renderer.pressedKey = null
    renderer.hoverProgress = 0
    renderer.pressedProgress = 0
    renderer.universeVisible = true
    renderer.starLayer.setPresentation.mockClear()

    renderer.updateStellarPresentation(16)
    const first = renderer.presentation
    renderer.updateStellarPresentation(16)

    expect(renderer.presentation).toBe(first)
    expect(renderer.starLayer.setPresentation).toHaveBeenCalledOnce()
  })

  test('large-system focus and planet return share one system-aware radius while duplicate focus preserves pose', () => {
    const datum = makeDatum(makeStar(), { bodyR: 1 })
    const onPick = vi.fn()
    const renderer = recoveryHarness(datum, vi.fn())
    renderer.callbacks = { onPick }
    renderer.stars = [datum]
    renderer.universe = makeUniverse([datum.s])
    renderer.mode = 'all'; renderer.wormIdx = 0; renderer.universeVisible = true
    renderer.strataTransition = { phase: null }
    renderer.overviewTarget = Vector3.Zero(); renderer.overviewRadius = 300
    renderer.planets = [{ star: datum, orbitR: 100, radius: 4 }]
    renderer.clearPlanet = (BabylonRenderer.prototype as any).clearPlanet

    expect(renderer.focusStar('alpha')).toBe(datum.s)
    const systemRadius = renderer.activeFlight.flight.to.radius
    expect(systemRadius).toBeCloseTo(140.4)
    renderer.camera.target = new Vector3(7, 8, 9)
    renderer.camera.radius = 77
    expect(renderer.focusStar('alpha')).toBe(datum.s)
    expect(renderer.camera.target.asArray()).toEqual([7, 8, 9])
    expect(renderer.camera.radius).toBe(77)
    expect(onPick).toHaveBeenCalledOnce()

    renderer.selected = { question: { id: 'q' } }
    renderer.clearPlanet()
    expect(renderer.camera.radius).toBeCloseTo(systemRadius)
  })

  test('constructor failure cleanup tracks and removes installed pointer listeners', () => {
    const source = readFileSync('src/starmap/babylon/BabylonRenderer.ts', 'utf8')
    expect(source).toMatch(/let pointerListenersInstalled = false/)
    expect(source).toMatch(/let runtime: BabylonRuntime \| null = null/)
    expect(source).toMatch(/pointerListenersInstalled = true/)
    expect(source).toMatch(/catch \(cause\)[\s\S]+if \(pointerListenersInstalled\) this\.removePointerListeners\(\)/)
    expect(source).toMatch(/catch \(cause\)[\s\S]+if \(runtime\) runtime\.destroy\(\)/)
    expect(source.indexOf('pointerListenersInstalled = true')).toBeLessThan(source.indexOf('this.installPointerListeners()'))
    expect(source).toContain("addEventListener('pointerleave'")
    expect(source).toContain("removeEventListener('pointerleave'")
  })
})
