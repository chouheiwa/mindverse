import { describe, expect, it } from 'vitest'
import {
  CameraFlightController,
  cameraFlightFrame,
  cameraFlightDuration,
  computeSystemExtent,
  createCameraFlight,
  exitTarget,
  shouldExitOnWheel,
} from './cameraFlight'

const start = { target: { x: 0, y: 2, z: 4 }, radius: 100 }
const target = { x: 12, y: -4, z: 8 }

function flight(overrides: Partial<Parameters<typeof createCameraFlight>[0]> = {}) {
  return createCameraFlight({
    token: 1,
    starKey: 'star-a',
    start,
    targetStar: target,
    bodyR: 2,
    systemExtent: 20,
    overviewRadius: 200,
    distance: 40,
    requestedMs: 1_000,
    reducedMotion: false,
    ...overrides,
  })
}

describe('camera flight geometry', () => {
  it('uses the exact normal duration formula and clamps its bounds', () => {
    expect(cameraFlightDuration(40, false, 1)).toBe(900 + Math.log1p(40) * 90)
    expect(cameraFlightDuration(0, false, 1)).toBe(900)
    expect(cameraFlightDuration(1e9, false, 1)).toBe(1300)
  })

  it('caps Reduced Motion at 120ms while allowing an immediate jump', () => {
    expect(cameraFlightDuration(40, true, 500)).toBe(120)
    expect(cameraFlightDuration(40, true, 80)).toBe(80)
    expect(cameraFlightDuration(40, true, 0)).toBe(0)
  })

  it('computes system extent and falls back to six body radii without planets', () => {
    expect(computeSystemExtent(2, [])).toBe(12)
    expect(computeSystemExtent(2, [{ orbitR: 2, radius: 1 }])).toBe(3)
    expect(computeSystemExtent(2, [
      { orbitR: 7, radius: 1 },
      { orbitR: 15, radius: 3 },
    ])).toBe(18)
  })

  it('targets the star and derives destination radius from body and system extent', () => {
    const result = flight()
    expect(result).toEqual(expect.objectContaining({ ok: true }))
    if (!result.ok) return
    expect(result.flight.to).toEqual({ target, radius: 28 })

    const capped = flight({ bodyR: 10, systemExtent: 500, overviewRadius: 200 })
    expect(capped.ok && capped.flight.to.radius).toBe(144)
  })

  it('eases target vectors and logarithmically interpolates radius', () => {
    const result = flight({ start: { target: { x: 0, y: 0, z: 0 }, radius: 100 } })
    if (!result.ok) throw new Error('expected valid flight')
    const frame = cameraFlightFrame(result.flight, result.flight.durationMs / 2)
    expect(frame).toEqual(expect.objectContaining({ ok: true }))
    if (!frame.ok) return
    expect(frame.frame.target).toEqual({ x: 6, y: -2, z: 4 })
    expect(frame.frame.radius).toBeCloseTo(Math.sqrt(100 * 28))
    expect(frame.frame.progress).toBe(0.5)
    expect(frame.frame.complete).toBe(false)
  })

  it('completes at the destination once elapsed milliseconds reach the duration', () => {
    const result = flight()
    if (!result.ok) throw new Error('expected valid flight')
    for (const elapsedMs of [result.flight.durationMs, result.flight.durationMs + 500]) {
      const frame = cameraFlightFrame(result.flight, elapsedMs)
      if (!frame.ok) throw new Error('expected valid frame')
      expect(frame.frame).toMatchObject({ target, radius: 28, progress: 1, complete: true })
    }
  })

  it('returns errors for invalid construction and sampling instead of emitting NaN', () => {
    expect(flight({ targetStar: { x: Number.NaN, y: 0, z: 0 } })).toEqual({
      ok: false, error: 'invalid-input',
    })
    expect(flight({ distance: Number.POSITIVE_INFINITY })).toEqual({
      ok: false, error: 'invalid-input',
    })
    const result = flight()
    if (!result.ok) throw new Error('expected valid flight')
    expect(cameraFlightFrame(result.flight, Number.NaN))
      .toEqual({ ok: false, error: 'invalid-frame' })
  })

  it('completes a zero-duration Reduced Motion flight at zero elapsed milliseconds', () => {
    const result = flight({ reducedMotion: true, requestedMs: 0 })
    if (!result.ok) throw new Error('expected valid flight')
    const frame = cameraFlightFrame(result.flight, 0)
    if (!frame.ok) throw new Error('expected valid frame')
    expect(frame.frame).toMatchObject({ target, radius: 28, progress: 1, complete: true })
  })
})

describe('CameraFlightController', () => {
  it('invalidates the old generation when starting a new flight', () => {
    const controller = new CameraFlightController()
    const first = controller.start({
      starKey: 'star-a', start, targetStar: target, bodyR: 2, systemExtent: 20,
      overviewRadius: 200, distance: 40, requestedMs: 1_000, reducedMotion: false,
    })
    const second = controller.start({
      starKey: 'star-b', start, targetStar: { x: 3, y: 2, z: 1 }, bodyR: 2,
      systemExtent: 20, overviewRadius: 200, distance: 30, requestedMs: 1_000,
      reducedMotion: false,
    })
    if (first.kind !== 'started' || second.kind !== 'started') throw new Error('expected starts')
    expect(controller.isActive(first.flight.token)).toBe(false)
    expect(controller.isActive(second.flight.token)).toBe(true)
    expect(second.flight.token).toBeGreaterThan(first.flight.token)
  })

  it('preserves selected intent on user cancellation but clears it for hierarchy changes', () => {
    const controller = new CameraFlightController()
    const args = {
      starKey: 'star-a', start, targetStar: target, bodyR: 2, systemExtent: 20,
      overviewRadius: 200, distance: 40, requestedMs: 1_000, reducedMotion: false,
    } as const
    const first = controller.start(args)
    if (first.kind !== 'started') throw new Error('expected start')
    controller.cancel('user')
    expect(controller.isActive(first.flight.token)).toBe(false)
    expect(controller.selectedStarKey).toBe('star-a')

    controller.cancel('planet')
    expect(controller.selectedStarKey).toBeNull()
  })

  it.each(['reset', 'planet', 'strata', 'suspend', 'destroy'] as const)(
    '%s cancellation invalidates an active flight',
    (reason) => {
      const controller = new CameraFlightController()
      const result = controller.start({
        starKey: 'star-a', start, targetStar: target, bodyR: 2, systemExtent: 20,
        overviewRadius: 200, distance: 40, requestedMs: 1_000, reducedMotion: false,
      })
      if (result.kind !== 'started') throw new Error('expected start')
      controller.cancel(reason)
      expect(controller.isActive(result.flight.token)).toBe(false)
    },
  )

  it('returns a no-op when focusing the current selected star', () => {
    const controller = new CameraFlightController()
    const args = {
      starKey: 'star-a', start, targetStar: target, bodyR: 2, systemExtent: 20,
      overviewRadius: 200, distance: 40, requestedMs: 1_000, reducedMotion: false,
    } as const
    expect(controller.start(args).kind).toBe('started')
    expect(controller.start(args)).toEqual({ kind: 'noop', reason: 'already-focused' })
  })
})

describe('focus exits', () => {
  it('follows the star/planet hierarchy', () => {
    expect(exitTarget('planet-focus')).toBe('star-focus')
    expect(exitTarget('star-focus')).toBe('panorama')
    expect(exitTarget('panorama')).toBeNull()
    expect(exitTarget('approach')).toBeNull()
    expect(exitTarget('strata')).toBeNull()
  })

  it('exits only for outward wheel input beyond the radius threshold', () => {
    expect(shouldExitOnWheel(1, 20.001, 20)).toBe(true)
    expect(shouldExitOnWheel(1, 20, 20)).toBe(false)
    expect(shouldExitOnWheel(0, 21, 20)).toBe(false)
    expect(shouldExitOnWheel(-1, 21, 20)).toBe(false)
  })
})
