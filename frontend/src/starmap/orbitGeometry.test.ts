import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { MAJOR_ORBIT_COUNT, orbitPhase, orbitPlane, orbitPeriodFor, orbitRadiusFor, systemOrbit } from './orbitGeometry'

describe('planet orbit geometry', () => {
  it('numbers orbits from zero, exactly as the Three instance buffer does', () => {
    // gl/bodies.ts: phase = (idx · 137.508 + seed · 31.7)·π/180，idx 从 0 起。
    // 迁移里用了 1 起的 orbitIndex，第一颗行星因此整整错开 137.5° ——
    // 近景里恒星跑到画面另一侧，就是这一处。
    expect(orbitPhase(0, 0)).toBeCloseTo(0, 12)
    expect(orbitPhase(1, 0)).toBeCloseTo((137.508 * Math.PI) / 180, 12)
    expect(orbitPhase(0, 2)).toBeCloseTo((63.4 * Math.PI) / 180, 12)
  })

  it('keeps the Three orbit ladder and Kepler-ish periods', () => {
    expect(orbitRadiusFor(0)).toBeCloseTo(2.1, 12)
    expect(orbitRadiusFor(2)).toBeCloseTo(2.1 + 2 * 1.15, 12)
    expect(orbitPeriodFor(2.1)).toBeCloseTo(7 + 2.4 * 2.1 ** 1.5, 12)
    expect(orbitPeriodFor(4.4)).toBeGreaterThan(orbitPeriodFor(2.1))
  })

  it('gives each orbit its own small tilt so the system has depth', () => {
    const u = [1, 0, 0] as const
    const v = [0, 0, 1] as const
    const axis = [0, 1, 0] as const
    const first = orbitPlane(0, u, v, axis)
    const second = orbitPlane(1, u, v, axis)
    expect(first.u).not.toEqual(second.u)
    for (const plane of [first, second]) {
      expect(Math.hypot(...plane.u)).toBeCloseTo(1, 9)
      // 倾角不超过 ±0.11 弧度：是层次，不是乱飞
      expect(Math.abs(plane.u[1])).toBeLessThan(0.111)
    }
    expect(first.v).toEqual([...v])
  })

  it('is the single source both renderers derive orbits from', () => {
    for (const module of ['src/starmap/gl/bodies.ts', 'src/starmap/babylon/BabylonRenderer.ts']) {
      const source = readFileSync(module, 'utf8')
      // 两个渲染器都从 systemOrbit 拿半径、相位与小行星带判定，谁也不自己算。
      expect(source).toMatch(/systemOrbit\(/)
      expect(source).not.toMatch(/orbitRadiusFor\(|orbitPhase\(/)
      expect(source).not.toMatch(/137\.508/)
    }
  })

  it('gives at most eight planets their own orbit and sweeps the rest into an asteroid belt', () => {
    // 示例语料里最大的恒星挂了 50 个问题：每颗一条等距轨道就是 50 个同心环，最外圈
    // 半径 58。像真的太阳系：前八名各占一条轨道，其余进最外圈一条宽带，画成小天体。
    expect(MAJOR_ORBIT_COUNT).toBe(8)
    for (let index = 0; index < 8; index += 1) {
      const orbit = systemOrbit(index, 50, 3)
      expect(orbit.belt).toBe(false)
      expect(orbit.radius).toBeCloseTo(orbitRadiusFor(index), 12)
      expect(orbit.bodyScale).toBe(1)
      expect(orbit.phase).toBeCloseTo(orbitPhase(index, 3), 12)
    }
    const beltInner = orbitRadiusFor(8) + 0.4
    const phases: number[] = []
    let maxRadius = 0
    for (let index = 8; index < 50; index += 1) {
      const orbit = systemOrbit(index, 50, 3)
      expect(orbit.belt).toBe(true)
      expect(orbit.radius).toBeGreaterThanOrEqual(beltInner)
      expect(orbit.radius).toBeLessThanOrEqual(beltInner + 2.6)
      expect(orbit.bodyScale).toBeLessThan(0.6)
      maxRadius = Math.max(maxRadius, orbit.radius)
      phases.push(((orbit.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2))
    }
    expect(maxRadius).toBeLessThan(15)
    // 带上的天体绕整圈铺开，而不是挤在一侧。
    phases.sort((a, b) => a - b)
    expect(phases[phases.length - 1]! - phases[0]!).toBeGreaterThan(5.5)
    for (let i = 1; i < phases.length; i += 1) expect(phases[i]! - phases[i - 1]!).toBeGreaterThan(0.02)
  })

  it('leaves small systems exactly as they were', () => {
    for (let index = 0; index < 3; index += 1) {
      const orbit = systemOrbit(index, 3, 7)
      expect(orbit).toEqual({
        radius: orbitRadiusFor(index), belt: false, bodyScale: 1, phase: orbitPhase(index, 7),
      })
    }
  })
})
