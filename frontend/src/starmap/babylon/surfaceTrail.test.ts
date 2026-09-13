import { describe, expect, it } from 'vitest'
import { layoutSurfaceTrail } from './surfaceTrail'
import type { Vec3 } from './cubeSphere'

// 从落点铺一条踩出来的小径，指向你在时间上接着看的那个问题；尽头一块路牌。
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const angleBetween = (a: Vec3, b: Vec3) => Math.acos(Math.min(1, dot(a, b)))

describe('surface trail', () => {
  it('walks a geodesic from the landing site toward the bearing, ending at a signpost', () => {
    const landing: Vec3 = [0, 1, 0]
    const trail = layoutSurfaceTrail(landing, [0.3, 0.9, 0.3])
    expect(trail.steps.length).toBeGreaterThanOrEqual(8)
    let previous = 0
    for (const step of trail.steps) {
      expect(Math.hypot(...step)).toBeCloseTo(1, 9)
      const angle = angleBetween(step, landing)
      expect(angle).toBeGreaterThan(previous)
      expect(angle).toBeLessThan(0.1)
      // 全在朝向的那一侧。
      expect(step[2]).toBeGreaterThan(0)
      expect(step[0]).toBeGreaterThan(0)
      previous = angle
    }
    // 路牌在小径尽头之外一点，地平线以内。
    expect(angleBetween(trail.signpost, landing)).toBeGreaterThan(previous)
    expect(angleBetween(trail.signpost, landing)).toBeLessThan(0.13)
    // 方位正确：沿着 [1,0,1] 方向。
    expect(trail.signpost[0]).toBeCloseTo(trail.signpost[2], 9)
  })

  it('picks any tangent when the bearing is straight up or degenerate', () => {
    for (const bearing of [[0, 1, 0], [0, 0, 0], [Number.NaN, 0, 0]] as const) {
      const trail = layoutSurfaceTrail([0, 1, 0], bearing as Vec3)
      expect(trail.steps.length).toBeGreaterThan(0)
      expect(trail.steps.every((step) => step.every(Number.isFinite))).toBe(true)
    }
  })
})


it('ends the walk near the observer rather than near the horizon', () => {
  const layout = layoutSurfaceTrail([0, 1, 0], [0, 0, 1])
  expect(angleBetween(layout.steps[0]!, [0, 1, 0])).toBeLessThanOrEqual(0.013)
  expect(angleBetween(layout.signpost, [0, 1, 0])).toBeLessThanOrEqual(0.065)
})
