import { describe, expect, test } from 'vitest'
import { nextPlanetLod as threeNextPlanetLod } from '../gl/planetMaterials'
import { initialPlanetLod, nextPlanetLod, projectedCoverage, projectedSphereDiameterPixels } from './planetLod'

describe('projectedCoverage', () => {
  test('reports projected diameter as a fraction of the canvas short edge', () => {
    const landscape = projectedCoverage(1, 10, Math.PI / 2, 1000, 500)
    const portrait = projectedCoverage(1, 10, Math.PI / 2, 500, 1000)

    expect(landscape).toBeCloseTo(Math.tan(Math.asin(0.1)), 8)
    expect(portrait).toBeCloseTo(2 * Math.tan(Math.asin(0.1)), 8)
  })

  test('returns zero for invalid geometry and clamps oversized projections', () => {
    expect(projectedCoverage(0, 10, 1, 100, 100)).toBe(0)
    expect(projectedCoverage(1, 1, 1, 100, 100)).toBe(0)
    expect(projectedCoverage(1, 10, Number.NaN, 100, 100)).toBe(0)
    expect(projectedCoverage(9, 10, 0.1, 100, 100)).toBe(1)
  })

  test('uses the projected spherical limb instead of an inflated box-corner envelope', () => {
    const diameter = projectedSphereDiameterPixels(1, 10, Math.PI / 2, 1440, 900)
    const boxCornerEnvelope = diameter * Math.SQRT2

    expect(diameter).toBeCloseTo(90.4534, 3)
    expect(boxCornerEnvelope - diameter).toBeGreaterThan(diameter * 0.4)
  })
})

describe('unfocused planet tiers follow the Three pixel ladder', () => {
  test('uses gl/planetMaterials thresholds in projected radius pixels', () => {
    // Three: far→medium ≥18px、medium→far <12px、medium→near ≥84px、near→medium ≤72px。
    // 迁移版换成了「占屏比例」阈值 0.045/0.03，于是同一颗行星在 720p 和 1440p
    // 上会落到不同的档 —— 阶梯本来就是按像素定的。
    expect(nextPlanetLod('low', 17.9, false)).toBe('low')
    expect(nextPlanetLod('low', 18, false)).toBe('medium')
    expect(nextPlanetLod('medium', 11.9, false)).toBe('low')
    expect(nextPlanetLod('medium', 12, false)).toBe('medium')
    expect(nextPlanetLod('medium', 84, false)).toBe('high')
    expect(nextPlanetLod('high', 72, false)).toBe('medium')
    expect(nextPlanetLod('high', 72.1, false)).toBe('high')
  })

  test('matches Three tier for tier on the same input', () => {
    for (const radius of [0, 5, 11, 12, 17, 18, 40, 71, 72, 83, 84, 200]) {
      for (const [mine, theirs] of [['low', 'far'], ['medium', 'medium'], ['high', 'near']] as const) {
        const map = { far: 'low', medium: 'medium', near: 'high' } as const
        expect(nextPlanetLod(mine, radius, false)).toBe(map[threeNextPlanetLod(theirs, radius)])
      }
    }
  })
})

describe('planet LOD selection', () => {
  test('selects initial levels and reserves high LOD for the focused planet', () => {
    expect(initialPlanetLod(17.9, false)).toBe('low')
    expect(initialPlanetLod(18, false)).toBe('medium')
    expect(initialPlanetLod(4, true)).toBe('high')
  })

  test('a focused planet keeps the finest surface at any projected size', () => {
    // Three 的 near 档要 84px 半径；按旧版取景聚焦行星只有 20–39px，
    // 旧版是在阅读工作台拉到 PLANET_NEAR 时才跨线的。这里提前一档，
    // 并在 planetLod.ts 里写明这是记录在案的偏差。
    for (const radius of [1, 20, 39, 200]) {
      expect(nextPlanetLod('low', radius, true)).toBe('high')
      expect(initialPlanetLod(radius, true)).toBe('high')
    }
  })

  test('clamps hostile input to the coarsest tier instead of throwing', () => {
    expect(nextPlanetLod('medium', Number.NaN, false)).toBe('low')
    expect(nextPlanetLod('low', Number.NEGATIVE_INFINITY, false)).toBe('low')
  })
})
