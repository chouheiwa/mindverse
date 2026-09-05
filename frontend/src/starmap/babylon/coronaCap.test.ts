import { describe, expect, it } from 'vitest'
import {
  FOCUS_CORONA_MAX_PX,
  cappedCoronaScale,
} from './coronaCap'

describe('focused corona projected-size cap', () => {
  it('keeps Three\'s glow ceiling', () => {
    // gl/stars.ts: matGlow 的 uMaxPx = 520。星芒 360、硬核 90 都更小，
    // 辉光是唯一决定聚焦画面里那团白有多大的那一层。
    expect(FOCUS_CORONA_MAX_PX).toBe(520)
  })

  it('leaves the corona alone while it still fits the ceiling', () => {
    // world diameter 2·1.25·3 = 7.5，距离 60、projScale 623 → 78px，远在上限内
    expect(cappedCoronaScale(1.25, 3, 60, 623)).toBeCloseTo(3, 6)
  })

  it('shrinks it once flying close would blow it past the ceiling', () => {
    const scale = cappedCoronaScale(1.25, 3, 3, 623)
    expect(scale).toBeLessThan(3)
    // 换算回像素刚好落在上限
    expect(2 * 1.25 * scale * 623 / 3).toBeCloseTo(FOCUS_CORONA_MAX_PX, 3)
  })

  it('never inverts or vanishes on hostile input', () => {
    const cases: readonly (readonly [number, number, number, number])[] = [
      [0, 3, 3, 623], [1.25, 0, 3, 623], [1.25, 3, 0, 623], [1.25, 3, 3, 0],
      [Number.NaN, 3, 3, 623], [1.25, Number.NaN, 3, 623], [1.25, 3, -5, 623],
    ]
    for (const [radius, scaleIn, distance, projection] of cases) {
      const scale = cappedCoronaScale(radius, scaleIn, distance, projection)
      expect(Number.isFinite(scale)).toBe(true)
      expect(scale).toBeGreaterThan(0)
    }
  })
})
