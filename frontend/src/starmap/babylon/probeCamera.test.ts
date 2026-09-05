import { describe, expect, it } from 'vitest'
import { STANDARD_INSPECTION_POSE } from '../probeInspection'
import {
  PROBE_APPROACH_MS,
  approachMix,
  probeInspectionCamera,
  probeInspectionLookAt,
} from './probeCamera'

const probe: readonly [number, number, number] = [3, -1, 5]

describe('probe inspection camera', () => {
  it('looks at the probe, offset by the pan the user applied', () => {
    const lookAt = probeInspectionLookAt(probe, { ...STANDARD_INSPECTION_POSE, panX: 0.4, panY: -0.25 })
    expect(lookAt).toEqual([3.4, -1.25, 5])
  })

  it('places the camera on the pose sphere around the probe, with Three axis order', () => {
    const pose = { ...STANDARD_INSPECTION_POSE, yaw: 0.42, pitch: -0.16, distance: 3.2 }
    const { position, lookAt } = probeInspectionCamera(probe, pose)
    // Three: x = +sin(yaw)cos(pitch)·d, y = −sin(pitch)·d, z = +cos(yaw)cos(pitch)·d
    expect(position[0]).toBeCloseTo(lookAt[0] + Math.sin(0.42) * Math.cos(-0.16) * 3.2, 6)
    expect(position[1]).toBeCloseTo(lookAt[1] - Math.sin(-0.16) * 3.2, 6)
    expect(position[2]).toBeCloseTo(lookAt[2] + Math.cos(0.42) * Math.cos(-0.16) * 3.2, 6)
    expect(Math.hypot(position[0] - lookAt[0], position[1] - lookAt[1], position[2] - lookAt[2]))
      .toBeCloseTo(3.2, 6)
  })

  it('honours yaw, pitch and distance so dragging really orbits the craft', () => {
    const base = probeInspectionCamera(probe, STANDARD_INSPECTION_POSE).position
    const turned = probeInspectionCamera(probe, { ...STANDARD_INSPECTION_POSE, yaw: 2.1 }).position
    const pulled = probeInspectionCamera(probe, { ...STANDARD_INSPECTION_POSE, distance: 6 }).position
    expect(Math.hypot(base[0] - turned[0], base[1] - turned[1], base[2] - turned[2])).toBeGreaterThan(1)
    expect(Math.hypot(pulled[0] - probe[0], pulled[1] - probe[1], pulled[2] - probe[2])).toBeCloseTo(6, 6)
  })

  it('clamps out-of-range poses instead of flinging the camera away', () => {
    const wild = probeInspectionCamera(probe, {
      yaw: Number.NaN, pitch: 99, distance: -4, panX: 40, panY: 40,
    })
    expect(wild.position.every(Number.isFinite)).toBe(true)
    const reach = Math.hypot(...wild.position.map((value, axis) => value - probe[axis]) as [number, number, number])
    expect(reach).toBeLessThan(10)
  })

  it('ramps the approach over Three PROBE_APPROACH_MS and saturates at one', () => {
    expect(PROBE_APPROACH_MS).toBe(520)
    expect(approachMix(0, PROBE_APPROACH_MS)).toBe(0)
    expect(approachMix(260, PROBE_APPROACH_MS)).toBeCloseTo(0.5, 6)
    expect(approachMix(900, PROBE_APPROACH_MS)).toBe(1)
    expect(approachMix(Number.NaN, PROBE_APPROACH_MS)).toBe(0)
  })
})
