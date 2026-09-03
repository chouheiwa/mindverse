import { describe, expect, it } from 'vitest'
import type { StarDatum } from '../gl/starData'
import { starWorldPosition } from '../gl/starData'
import {
  PointerGestureController,
  buildProjectedStarCandidates,
  pickProjectedStar,
  type ProjectedStarCandidate,
} from './starPicker'

const viewport = { width: 200, height: 120 }

function candidate(overrides: Partial<ProjectedStarCandidate> = {}): ProjectedStarCandidate {
  return {
    starKey: 'star-a',
    x: 50,
    y: 40,
    depth: 0.5,
    visualRadiusPx: 12,
    visible: true,
    ...overrides,
  }
}

function pick(
  x: number,
  y: number,
  inputKind: 'mouse' | 'touch' | 'pen',
  candidates: readonly ProjectedStarCandidate[],
  capturedByHigherPriority = false,
) {
  return pickProjectedStar({ x, y, inputKind, viewport, capturedByHigherPriority }, candidates)
}

describe('pickProjectedStar', () => {
  it('clamps mouse hit radii to 10..28 CSS pixels and includes the exact edge', () => {
    expect(pick(60, 40, 'mouse', [candidate({ visualRadiusPx: 1 })])).toBe('star-a')
    expect(pick(60.001, 40, 'mouse', [candidate({ visualRadiusPx: 1 })])).toBeNull()
    expect(pick(78, 40, 'mouse', [candidate({ visualRadiusPx: 100 })])).toBe('star-a')
    expect(pick(78.001, 40, 'mouse', [candidate({ visualRadiusPx: 100 })])).toBeNull()
  })

  it.each(['touch', 'pen'] as const)('%s clamps hit radii to 22..36 CSS pixels', (inputKind) => {
    expect(pick(72, 40, inputKind, [candidate({ visualRadiusPx: 1 })])).toBe('star-a')
    expect(pick(72.001, 40, inputKind, [candidate({ visualRadiusPx: 1 })])).toBeNull()
    expect(pick(86, 40, inputKind, [candidate({ visualRadiusPx: 100 })])).toBe('star-a')
    expect(pick(86.001, 40, inputKind, [candidate({ visualRadiusPx: 100 })])).toBeNull()
  })

  it('excludes invisible, offscreen, behind-camera, and beyond-far-plane candidates', () => {
    const invalid = [
      candidate({ starKey: 'invisible', x: 50, visible: false }),
      candidate({ starKey: 'offscreen-x', x: -0.001 }),
      candidate({ starKey: 'offscreen-y', y: 120.001 }),
      candidate({ starKey: 'behind', depth: -0.001 }),
      candidate({ starKey: 'too-far', depth: 1.001 }),
    ]
    expect(pick(50, 40, 'mouse', invalid)).toBeNull()
  })

  it('ranks by distance squared, then nearer depth, then stable star key', () => {
    expect(pick(50, 40, 'mouse', [
      candidate({ starKey: 'nearer-screen', x: 51, depth: 0.9 }),
      candidate({ starKey: 'farther-screen', x: 52, depth: 0.1 }),
    ])).toBe('nearer-screen')

    expect(pick(50, 40, 'mouse', [
      candidate({ starKey: 'far-depth', x: 51, depth: 0.8 }),
      candidate({ starKey: 'near-depth', x: 49, depth: 0.2 }),
    ])).toBe('near-depth')

    expect(pick(50, 40, 'mouse', [
      candidate({ starKey: 'star-z', x: 51, depth: 0.2 }),
      candidate({ starKey: 'star-a', x: 49, depth: 0.2 }),
    ])).toBe('star-a')
  })

  it('returns null when a higher-priority planet or specimen captured the event', () => {
    expect(pick(50, 40, 'mouse', [candidate()], true)).toBeNull()
  })
})

function datum(overrides: Partial<StarDatum> = {}): StarDatum {
  return {
    s: {
      id: 'star:v1:private:alpha', scope: 'private', externalQueryAllowed: false,
      questionIds: [], probeIds: [], c: 'alpha', g: 0, p: [8, 2, -3], n: 7,
      o: 1, f: 0, hue: 210, sat: 60, pe: 0.8, bu: 0.25, fi: '', la: '', ev: [],
    },
    p: [8, 2, -3], center: [1, -2, 4], axis: [0, 1, 0], period: 23,
    start: [0, 0, 0], ignite: 0, pointSize: 8, bodyR: 0.5, bright: 0.8,
    burst: 0.25, seed: 7, rot: 0, color: [0.2, 0.5, 1], kelvin: 7000,
    sysAxis: [0, 1, 0], sysU: [1, 0, 0], sysV: [0, 0, 1],
    ...overrides,
  }
}

describe('buildProjectedStarCandidates', () => {
  it.each([0, 2317, 19_000])('projects the shared animated world position at %i ms', (elapsedMs) => {
    const star = datum()
    let projectedWorld: readonly [number, number, number] | undefined
    const result = buildProjectedStarCandidates([star], elapsedMs, 1.35, (world) => {
      projectedWorld = [world.x, world.y, world.z]
      return { x: 10, y: 20, depth: 0.4, visible: true }
    })
    const expected = starWorldPosition(star, elapsedMs, 1.35, {
      set: (x, y, z) => [x, y, z] as const,
    })

    expect(projectedWorld).toEqual(expected)
    expect(result).toEqual([{
      starKey: 'star:v1:private:alpha', x: 10, y: 20, depth: 0.4,
      visualRadiusPx: expect.any(Number), visible: true,
    }])
  })

  it('uses zero bob amplitude for Reduced Motion while retaining orbital movement', () => {
    const star = datum()
    let world: readonly [number, number, number] | undefined
    buildProjectedStarCandidates([star], 6432, 0, (position) => {
      world = [position.x, position.y, position.z]
      return { x: 0, y: 0, depth: 0, visible: true }
    })
    const expected = starWorldPosition(star, 6432, 0, {
      set: (x, y, z) => [x, y, z] as const,
    })
    expect(world).toEqual(expected)
  })

  it('derives the hit visual radius from the shared visual descriptor', () => {
    const star = datum({ bright: 0, burst: 0 })
    const [result] = buildProjectedStarCandidates([star], 0, 0, () => ({
      x: 1, y: 2, depth: 0.3, visible: true,
    }))
    expect(result?.visualRadiusPx).toBe(6)
  })
})

describe('PointerGestureController', () => {
  it('accepts 5.999 CSS pixels of cumulative movement but treats exactly 6 as drag', () => {
    const click = new PointerGestureController()
    click.pointerDown({ pointerId: 1, inputKind: 'mouse', x: 0, y: 0, starKey: 'star-a' })
    click.pointerMove({ pointerId: 1, x: 3, y: 2.999 })
    expect(click.pointerUp({ pointerId: 1, x: 3, y: 2.999, starKey: 'star-a' })).toBe('star-a')

    const drag = new PointerGestureController()
    drag.pointerDown({ pointerId: 1, inputKind: 'touch', x: 0, y: 0, starKey: 'star-a' })
    drag.pointerMove({ pointerId: 1, x: 3, y: 3 })
    expect(drag.pointerUp({ pointerId: 1, x: 3, y: 3, starKey: 'star-a' })).toBeNull()
  })

  it('accumulates Manhattan movement across direction changes', () => {
    const gesture = new PointerGestureController()
    gesture.pointerDown({ pointerId: 4, inputKind: 'pen', x: 0, y: 0, starKey: 'star-a' })
    gesture.pointerMove({ pointerId: 4, x: 4, y: 0 })
    gesture.pointerMove({ pointerId: 4, x: 1, y: 0 })
    expect(gesture.snapshot().accumulatedMovement).toBe(7)
    expect(gesture.pointerUp({ pointerId: 4, x: 1, y: 0, starKey: 'star-a' })).toBeNull()
  })

  it('rejects release on a different star and clears the gesture', () => {
    const gesture = new PointerGestureController()
    gesture.pointerDown({ pointerId: 1, inputKind: 'mouse', x: 1, y: 2, starKey: 'star-a' })
    expect(gesture.pointerUp({ pointerId: 1, x: 1, y: 2, starKey: 'star-b' })).toBeNull()
    expect(gesture.snapshot().activePointerId).toBeNull()
    expect(gesture.snapshot().pressedStarKey).toBeNull()
  })

  it('ignores release from the wrong pointer without completing the active gesture', () => {
    const gesture = new PointerGestureController()
    gesture.pointerDown({ pointerId: 1, inputKind: 'mouse', x: 1, y: 2, starKey: 'star-a' })
    expect(gesture.pointerUp({ pointerId: 2, x: 1, y: 2, starKey: 'star-a' })).toBeNull()
    expect(gesture.snapshot().activePointerId).toBe(1)
    expect(gesture.snapshot().pressedStarKey).toBe('star-a')
  })

  it.each(['pointerCancel', 'lostPointerCapture'] as const)('%s cancels and clears pressed state', (transition) => {
    const gesture = new PointerGestureController()
    gesture.pointerDown({ pointerId: 1, inputKind: 'mouse', x: 1, y: 2, starKey: 'star-a' })
    gesture[transition](1)
    expect(gesture.snapshot().activePointerId).toBeNull()
    expect(gesture.snapshot().pressedStarKey).toBeNull()
  })

  it('invalidates on a second pointer and never leaves pressed state behind', () => {
    const gesture = new PointerGestureController()
    gesture.pointerDown({ pointerId: 1, inputKind: 'touch', x: 1, y: 2, starKey: 'star-a' })
    gesture.pointerDown({ pointerId: 2, inputKind: 'touch', x: 3, y: 4, starKey: 'star-b' })
    expect(gesture.snapshot()).toMatchObject({
      activePointerId: 1,
      pressedStarKey: null,
      cancelled: true,
      multiPointerInvalidated: true,
    })
    expect(gesture.pointerUp({ pointerId: 1, x: 1, y: 2, starKey: 'star-a' })).toBeNull()
    expect(gesture.snapshot().activePointerId).toBeNull()
    expect(gesture.snapshot().pressedStarKey).toBeNull()
  })
})
