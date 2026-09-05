import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { orbitPhase, orbitPlane, orbitPeriodFor, orbitRadiusFor } from './orbitGeometry'

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
      expect(source).toMatch(/orbitPhase\(/)
      expect(source).not.toMatch(/137\.508/)
    }
  })
})
