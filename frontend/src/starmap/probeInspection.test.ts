import { afterEach, describe, expect, test, vi } from 'vitest'
import * as THREE from 'three'
import { indexUniverse } from '../domain/universe'
import type { CurrentStar, NormalizedCurrentUniverse } from '../types'
import { Renderer, probeOwnersById } from './Renderer'
import type { ProbePart } from './gl/probe'
import { starData, type StarDatum } from './gl/starData'
import {
  ProbeInspectionController,
  STANDARD_INSPECTION_POSE,
  type NormalizedPointerGesture,
} from './probeInspection'

const point = (id: number, x: number, y: number, button: 0 | 2 = 0) => ({ id, x, y, button })

const sharedProbe = {
  id: 'article:21', title: 'Shared article', url: 'https://zhuanlan.zhihu.com/p/21',
  bindings: [], discoverySources: ['public_search' as const],
}
const sharedStar = (id: string, concept: string): CurrentStar => ({
  id, c: concept, g: 0, p: [0, 0, -12], n: 1, o: 0, f: 1, hue: 210, sat: 70,
  pe: 1, bu: 0, fi: '', la: '', ev: [], scope: 'public', externalQueryAllowed: false,
  questionIds: [], probeIds: [sharedProbe.id],
})

function sharedProbeFixture(): NormalizedCurrentUniverse {
  const starB = sharedStar('star:v1:public:f44e64e75f3948e9', 'Beta')
  const starA = sharedStar('star:v1:public:8ed3f6ad685b959e', 'Alpha')
  return {
    schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
    meta: { items: 1, concepts: 2, clusters: 1, own: 0, fav: 1, span: [0, 0], medz: 0, p10z: 0, source: 'test', splits: 0 },
    clusters: [{ g: 0, name: 'Cluster', lead: 'Alpha', c: [0, 0, -12], n: 2, o: 0, f: 2, hue: 210, sat: 70, mem: ['Beta', 'Alpha'] }],
    stars: [starB, starA],
    particles: [], wormholes: [], solo: [], dark: [], nebula: [],
    questions: [], answers: [], probes: [sharedProbe],
  }
}

describe('ProbeInspectionController constraints', () => {
  test('clamps pitch while preserving finite yaw', () => {
    const controller = new ProbeInspectionController()
    expect(controller.rotate(20, 10_000).pitch).toBeLessThan(Math.PI / 2)
    const pose = controller.rotate(-40, -20_000)
    expect(pose.pitch).toBeGreaterThan(-Math.PI / 2)
    expect(Number.isFinite(pose.yaw)).toBe(true)
  })

  test('zoom cannot cross the probe or escape the inspection range', () => {
    const controller = new ProbeInspectionController()
    const nearest = controller.zoom(-1_000_000)
    const farthest = controller.zoom(1_000_000)
    expect(nearest.distance).toBeGreaterThan(1)
    expect(farthest.distance).toBeLessThan(10)
  })

  test('pan stays inside a radius that keeps the probe in frame', () => {
    const pose = new ProbeInspectionController().pan(100_000, 100_000)
    expect(Math.hypot(pose.panX, pose.panY)).toBeLessThanOrEqual(1.2)
  })

  test('reset returns the standard cinematic composition', () => {
    const controller = new ProbeInspectionController()
    controller.rotate(100, 100)
    controller.zoom(300)
    controller.pan(200, -100)
    expect(controller.reset()).toEqual(STANDARD_INSPECTION_POSE)
  })

  test('destroy makes every later input inert', () => {
    const controller = new ProbeInspectionController()
    const before = controller.rotate(20, 10)
    controller.destroy()
    expect(controller.rotate(100, 100)).toEqual(before)
    expect(controller.zoom(-100)).toEqual(before)
    expect(controller.pan(100, 100)).toEqual(before)
    expect(controller.keyboard('ArrowLeft')).toEqual(before)
    expect(controller.reset()).toEqual(before)
  })
})

describe('ProbeInspectionController normalized input', () => {
  test('single primary pointer rotates', () => {
    const controller = new ProbeInspectionController()
    const initial = controller.reset()
    controller.pointer({ type: 'start', pointers: [point(1, 10, 10)] })
    const pose = controller.pointer({ type: 'move', pointers: [point(1, 30, 25)] })
    expect(pose.yaw).not.toBe(initial.yaw)
    expect(pose.pitch).not.toBe(initial.pitch)
    expect(pose.panX).toBe(0)
  })

  test('single secondary pointer pans without rotating', () => {
    const controller = new ProbeInspectionController()
    const initial = controller.reset()
    controller.pointer({ type: 'start', pointers: [point(1, 10, 10, 2)] })
    const pose = controller.pointer({ type: 'move', pointers: [point(1, 30, 25, 2)] })
    expect(pose.yaw).toBe(initial.yaw)
    expect(pose.pitch).toBe(initial.pitch)
    expect(pose.panX).not.toBe(0)
    expect(pose.panY).not.toBe(0)
  })

  test('two pointers zoom and pan from span and centroid changes', () => {
    const controller = new ProbeInspectionController()
    const initial = controller.reset()
    controller.pointer({ type: 'start', pointers: [point(1, 0, 0), point(2, 20, 0)] })
    const pose = controller.pointer({ type: 'move', pointers: [point(1, 4, 8), point(2, 36, 8)] })
    expect(pose.distance).toBeLessThan(initial.distance)
    expect(pose.panX).not.toBe(0)
    expect(pose.panY).not.toBe(0)
  })

  test('keyboard arrows rotate and plus/minus zoom', () => {
    const controller = new ProbeInspectionController()
    const initial = controller.reset()
    expect(controller.keyboard('ArrowRight').yaw).toBeGreaterThan(initial.yaw)
    expect(controller.keyboard('ArrowUp').pitch).toBeLessThan(initial.pitch)
    const closer = controller.keyboard('+').distance
    expect(closer).toBeLessThan(initial.distance)
    expect(controller.keyboard('-').distance).toBeGreaterThan(closer)
  })

  test.each(['cancel', 'lost'] as const)('%s clears pointer history without changing pose', (type) => {
    const controller = new ProbeInspectionController()
    controller.pointer({ type: 'start', pointers: [point(1, 10, 10)] })
    const moved = controller.pointer({ type: 'move', pointers: [point(1, 20, 20)] })
    const cleared = controller.pointer({ type, pointers: [] } satisfies NormalizedPointerGesture)
    expect(cleared).toEqual(moved)
    expect(controller.pointer({ type: 'move', pointers: [point(1, 200, 200)] })).toEqual(moved)
  })

  test('end clears pointer history and ignores malformed finite input', () => {
    const controller = new ProbeInspectionController()
    const initial = controller.reset()
    controller.pointer({ type: 'start', pointers: [point(1, 10, 10)] })
    controller.pointer({ type: 'end', pointers: [] })
    expect(controller.pointer({
      type: 'move',
      pointers: [{ id: 1, x: Number.NaN, y: Infinity, button: 0 }],
    })).toEqual(initial)
  })
})

interface ProbeCommandRenderer {
  approachProbe(probeId: string, token: number): void
  startProbeScan(probeId: string, token: number): void
  setProbeInspectionPose(pose: ReturnType<ProbeInspectionController['reset']>): void
  focusProbePart(part: ProbePart | null): void
  exitProbeInspection(): void
  destroy(): void
  onDoubleClick(event: Pick<MouseEvent, 'clientX' | 'clientY'>): void
}

function commandRenderer(reduceMotion: boolean, callbacks: Record<string, unknown> = {}) {
  const renderer = Object.create(Renderer.prototype) as ProbeCommandRenderer & Record<string, unknown>
  renderer.reduceMotion = reduceMotion
  renderer.destroyed = false
  renderer.probeIds = new Set(['probe:1', 'probe:2'])
  const owner = { s: sharedStar('star:test', 'Test') } as StarDatum
  renderer.probeOwnersById = new Map([
    ['probe:1', [owner]],
    ['probe:2', [owner]],
  ])
  renderer.focusStar = null
  renderer.clearPlanet = vi.fn()
  renderer.applyFocus = vi.fn()
  renderer.probeTransition = null
  renderer.probeTransitionTimer = null
  renderer.probeTransitionRaf = 0
  renderer.inspectionCameraMix = 0
  renderer.cb = callbacks
  renderer.probes = {
    inspect: vi.fn(),
    setScanning: vi.fn(),
    setPartHighlight: vi.fn(),
    raycastPart: vi.fn(() => 'scanner-lens'),
  }
  renderer.canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) }
  renderer.camera = new THREE.PerspectiveCamera()
  renderer.raycaster = new THREE.Raycaster()
  renderer.pointerNdc = new THREE.Vector2()
  renderer.resources = { dispose: vi.fn() }
  renderer.signals = { destroy: vi.fn() }
  return renderer
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Renderer probe inspection commands', () => {
  test('reduced motion reports arrival through the same tokened event immediately', () => {
    const arrived = vi.fn()
    const renderer = commandRenderer(true, { onProbeArrived: arrived })
    renderer.approachProbe('probe:1', 41)
    expect(arrived).toHaveBeenCalledWith({ probeId: 'probe:1', token: 41 })
    expect((renderer.probes as { inspect: ReturnType<typeof vi.fn> }).inspect).toHaveBeenCalledWith('probe:1')
  })

  test('a new approach invalidates the old callback', () => {
    vi.useFakeTimers()
    const arrived = vi.fn()
    const renderer = commandRenderer(false, { onProbeArrived: arrived })
    renderer.approachProbe('probe:1', 1)
    renderer.approachProbe('probe:2', 2)
    vi.advanceTimersByTime(2_000)
    expect(arrived).toHaveBeenCalledTimes(1)
    expect(arrived).toHaveBeenCalledWith({ probeId: 'probe:2', token: 2 })
  })

  test('normal approach owns and cancels its animation frame', () => {
    const request = vi.fn(() => 71)
    const cancel = vi.fn()
    vi.stubGlobal('requestAnimationFrame', request)
    vi.stubGlobal('cancelAnimationFrame', cancel)
    const renderer = commandRenderer(false)
    renderer.approachProbe('probe:1', 1)
    expect(request).toHaveBeenCalledOnce()
    renderer.exitProbeInspection()
    expect(cancel).toHaveBeenCalledWith(71)
  })

  test('exit cancels scan completion and clears inspection visuals', () => {
    vi.useFakeTimers()
    const complete = vi.fn()
    const renderer = commandRenderer(false, { onProbeScanComplete: complete })
    renderer.startProbeScan('probe:1', 7)
    renderer.exitProbeInspection()
    vi.runAllTimers()
    expect(complete).not.toHaveBeenCalled()
    const probes = renderer.probes as Record<string, ReturnType<typeof vi.fn>>
    expect(probes.inspect).toHaveBeenLastCalledWith(null)
    expect(probes.setScanning).toHaveBeenLastCalledWith(false)
    expect(probes.setPartHighlight).toHaveBeenLastCalledWith(null)
  })

  test('destroy cancels an approach and suppresses its late callback', () => {
    vi.useFakeTimers()
    const arrived = vi.fn()
    const renderer = commandRenderer(false, { onProbeArrived: arrived })
    renderer.approachProbe('probe:1', 9)
    renderer.destroy()
    vi.runAllTimers()
    expect(arrived).not.toHaveBeenCalled()
  })

  test('scan completion keeps the probe id and token in normal and reduced motion', () => {
    vi.useFakeTimers()
    const normalComplete = vi.fn()
    const normal = commandRenderer(false, { onProbeScanComplete: normalComplete })
    normal.startProbeScan('probe:1', 12)
    vi.advanceTimersByTime(2_000)
    expect(normalComplete).toHaveBeenCalledWith({ probeId: 'probe:1', token: 12 })

    const reduced = commandRenderer(true)
    const reducedScanning = (reduced.probes as Record<string, ReturnType<typeof vi.fn>>).setScanning
    const reducedComplete = vi.fn(() => {
      expect(reducedScanning).toHaveBeenLastCalledWith(false)
    })
    reduced.cb = { onProbeScanComplete: reducedComplete }
    reduced.startProbeScan('probe:2', 13)
    expect(reducedScanning.mock.calls).toEqual([[true], [false]])
    expect(reducedComplete).toHaveBeenCalledWith({ probeId: 'probe:2', token: 13 })
  })

  test('invalid or failed commands report only the matching tokened error', () => {
    const failed = vi.fn()
    const renderer = commandRenderer(true, { onProbeError: failed })
    ;(renderer.probes as { inspect: ReturnType<typeof vi.fn> }).inspect.mockImplementation(() => {
      throw new Error('near model failed')
    })
    renderer.approachProbe('probe:1', 88)
    expect(failed).toHaveBeenCalledOnce()
    expect(failed.mock.calls[0][0]).toMatchObject({ probeId: 'probe:1', token: 88 })
    expect(failed.mock.calls[0][0].cause).toBeInstanceOf(Error)
  })

  test('pose, part focus and near-only double-click stay in the probe layer', () => {
    const changed = vi.fn()
    const renderer = commandRenderer(true, { onProbePartChange: changed })
    const pose = new ProbeInspectionController().pan(30, -20)
    renderer.approachProbe('probe:1', 3)
    renderer.setProbeInspectionPose(pose)
    renderer.focusProbePart('antenna')
    renderer.onDoubleClick({ clientX: 50, clientY: 50 })
    expect(renderer.inspectionPose).toEqual(pose)
    const probes = renderer.probes as Record<string, ReturnType<typeof vi.fn>>
    expect(probes.setPartHighlight).toHaveBeenCalledWith('antenna')
    expect(probes.raycastPart).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledWith('scanner-lens')
  })

  test('indexes every valid shared-probe owner in stable star-id order', () => {
    const fixture = sharedProbeFixture()
    const index = indexUniverse(fixture)
    const owners = probeOwnersById(index, starData(fixture)).get(sharedProbe.id) ?? []
    expect(owners.map(({ s }) => 'id' in s ? s.id : '')).toEqual([
      'star:v1:public:8ed3f6ad685b959e',
      'star:v1:public:f44e64e75f3948e9',
    ])
  })

  test('shared probe prefers its currently focused owner and otherwise uses the stable first owner', () => {
    const fixture = sharedProbeFixture()
    const index = indexUniverse(fixture)
    const owners = probeOwnersById(index, starData(fixture))
    const [ownerA, ownerB] = owners.get(sharedProbe.id) ?? []

    const focused = commandRenderer(true)
    focused.probeIds = new Set([sharedProbe.id])
    focused.probeOwnersById = owners
    focused.focusStar = ownerB
    focused.approachProbe(sharedProbe.id, 21)
    expect(focused.focusStar).toBe(ownerB)

    const panorama = commandRenderer(true)
    panorama.probeIds = new Set([sharedProbe.id])
    panorama.probeOwnersById = owners
    panorama.focusStar = null
    panorama.approachProbe(sharedProbe.id, 22)
    expect(panorama.focusStar).toBe(ownerA)
  })

  test('a valid indexed probe with no remaining owner reports an error with the same token', () => {
    const arrived = vi.fn()
    const failed = vi.fn()
    const renderer = commandRenderer(true, { onProbeArrived: arrived, onProbeError: failed })
    renderer.probeIds = new Set([sharedProbe.id])
    renderer.probeOwnersById = new Map()
    renderer.approachProbe(sharedProbe.id, 29)
    expect(arrived).not.toHaveBeenCalled()
    expect(failed).toHaveBeenCalledOnce()
    expect(failed.mock.calls[0][0]).toMatchObject({ probeId: sharedProbe.id, token: 29 })
  })
})
