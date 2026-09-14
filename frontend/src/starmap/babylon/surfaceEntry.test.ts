import { describe, expect, it } from 'vitest'
import type { Vec3 } from './cubeSphere'
import {
  ATMOSPHERE_TOP, slerpDirection, surfaceEntryNearPlane, surfaceEntryPose, surfaceEntryPresentation,
  surfaceEntryRadius,
} from './surfaceEntry'

const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const centre: Vec3 = [10, 0, 0]
const input = (progress: number) => ({
  from: [10, 0, 30] as Vec3,          // 进入时在行星侧后方 30 单位外
  fromTarget: centre,
  standing: [10.2, 0, 0] as Vec3,     // 落点在 +X 一侧，站立半径 0.2
  standingTarget: [10.2, 0.05, 0.4] as Vec3,
  centre,
  progress,
})

describe('从宇宙俯冲进来的编排', () => {
  it('两端严格对齐：起点是进入机位，终点是站立机位', () => {
    const start = surfaceEntryPose(input(0))
    start.position.forEach((value, axis) => expect(value).toBeCloseTo([10, 0, 30][axis]!, 9))
    start.target.forEach((value, axis) => expect(value).toBeCloseTo(centre[axis]!, 9))
    const end = surfaceEntryPose(input(1))
    end.position.forEach((value, axis) => expect(value).toBeCloseTo([10.2, 0, 0][axis]!, 9))
    end.target.forEach((value, axis) => expect(value).toBeCloseTo([10.2, 0.05, 0.4][axis]!, 9))
  })

  it('等比下落：过半时走到几何中点，而不是还悬在高空', () => {
    const radius = (p: number) => len([
      surfaceEntryPose(input(p)).position[0] - centre[0],
      surfaceEntryPose(input(p)).position[1] - centre[1],
      surfaceEntryPose(input(p)).position[2] - centre[2],
    ] as Vec3)
    // 30 → 0.2 的几何中点是 sqrt(30·0.2) ≈ 2.45。线性下落这时还在 15。
    expect(radius(0.5)).toBeCloseTo(Math.sqrt(30 * 0.2), 6)
    expect(surfaceEntryRadius(30, 0.2, 0)).toBeCloseTo(30, 9)
    expect(surfaceEntryRadius(30, 0.2, 1)).toBeCloseTo(0.2, 9)
    for (const bad of [0, -1, Number.NaN]) expect(Number.isFinite(surfaceEntryRadius(bad, 0.2, 0.5))).toBe(true)
    // 高度单调下降。
    let previous = radius(0)
    for (let p = 0.05; p <= 1.0001; p += 0.05) {
      const now = radius(p)
      expect(now).toBeLessThanOrEqual(previous + 1e-9)
      previous = now
    }
    // 方位在 0.7 之前就摆到了落点正上方：方向与落点半径方向基本重合。
    const at = surfaceEntryPose(input(0.72)).position
    const dir = [at[0] - centre[0], at[1] - centre[1], at[2] - centre[2]] as Vec3
    expect(dir[0] / len(dir)).toBeGreaterThan(0.999)
  })

  it('沿大圆绕过去，不穿过行星', () => {
    // 直线插值会从行星内部穿过；球面插值不会 —— 全程离心距不小于落点半径。
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const at = surfaceEntryPose(input(p)).position
      expect(len([at[0] - centre[0], at[1] - centre[1], at[2] - centre[2]] as Vec3)).toBeGreaterThanOrEqual(0.2 - 1e-9)
    }
  })

  it('呈现由离地高度驱动：高空是太空，进了大气才有天', () => {
    // 按进度驱动那一版的错：进度 0.45 时相机还在 94 倍半径外，天空却已经把整屏染橙。
    const far = surfaceEntryPresentation(111)
    expect(far.backdrop).toBe(1)
    expect(far.sky).toBe(0)
    expect(far.universeVisible).toBe(true)
    // 10 倍半径：还在太空，天空必须一点都没有。
    expect(surfaceEntryPresentation(10).sky).toBe(0)
    expect(surfaceEntryPresentation(10).universeVisible).toBe(true)
    const ground = surfaceEntryPresentation(1.01)
    expect(ground.backdrop).toBe(0)
    expect(ground.sky).toBe(1)
    expect(ground.universeVisible).toBe(false)
    // 越低越暗、越低天越亮，都是单调的。
    let backdrop = 1
    let sky = 0
    for (let h = 40; h >= 1; h -= 0.5) {
      const now = surfaceEntryPresentation(h)
      expect(now.backdrop).toBeLessThanOrEqual(backdrop + 1e-9)
      expect(now.sky).toBeGreaterThanOrEqual(sky - 1e-9)
      backdrop = now.backdrop
      sky = now.sky
    }
    // 宇宙层退场时背景已经淡完，不会「星星还在但星云突然消失」。
    expect(surfaceEntryPresentation(ATMOSPHERE_TOP).backdrop).toBeCloseTo(0, 6)
  })

  it('近裁剪面跟着离地高度走，落地才收到地表那个值', () => {
    expect(surfaceEntryNearPlane(100, 0.0004, 0.1)).toBeCloseTo(0.1, 9)
    expect(surfaceEntryNearPlane(0, 0.0004, 0.1)).toBeCloseTo(0.0004, 9)
    expect(surfaceEntryNearPlane(0.001, 0.0004, 0.1)).toBeCloseTo(0.0004, 9)
    expect(surfaceEntryNearPlane(0.2, 0.0004, 0.1)).toBeCloseTo(0.05, 9)
    for (const bad of [Number.NaN, -5, Infinity]) {
      expect(Number.isFinite(surfaceEntryNearPlane(bad, 0.0004, 0.1))).toBe(true)
    }
  })

  it('opposite approach directions follow a continuous arc instead of snapping halfway', () => {
    let previous = slerpDirection([1, 0, 0], [-1, 0, 0], 0)
    for (let step = 1; step <= 100; step += 1) {
      const next = slerpDirection([1, 0, 0], [-1, 0, 0], step / 100)
      expect(len(next)).toBeCloseTo(1, 9)
      expect(len([next[0] - previous[0], next[1] - previous[1], next[2] - previous[2]])).toBeLessThan(0.04)
      previous = next
    }
    expect(previous[0]).toBeCloseTo(-1, 9)
  })

  it('退化输入不产生 NaN', () => {
    const degenerate = surfaceEntryPose({
      from: [0, 0, 0], fromTarget: [0, 0, 0], standing: [0, 0, 0], standingTarget: [0, 0, 0],
      centre: [0, 0, 0], progress: Number.NaN,
    })
    expect(degenerate.position.every(Number.isFinite)).toBe(true)
    expect(degenerate.target.every(Number.isFinite)).toBe(true)
    expect(slerpDirection([0, 0, 0], [0, 0, 0], 0.5).every(Number.isFinite)).toBe(true)
    expect(len(slerpDirection([1, 0, 0], [-1, 0, 0], 0.5))).toBeCloseTo(1, 9)
  })
})
