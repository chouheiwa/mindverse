import { describe, expect, it } from 'vitest'
import type { StarDatum } from '../gl/starData'
import { describeStarVisual } from './starVisualDescriptor'

function datum(overrides: Partial<StarDatum> = {}): StarDatum {
  return {
    bright: 0.5,
    burst: 0,
    seed: 1,
    color: [1, 1, 1],
    ...overrides,
  } as StarDatum
}

describe('describeStarVisual', () => {
  it('preserves distinct warm and cool stellar colors', () => {
    expect(describeStarVisual(datum({ color: [1, 0.42, 0.16] })).color)
      .toEqual([1, 0.42, 0.16])
    expect(describeStarVisual(datum({ color: [0.24, 0.58, 1] })).color)
      .toEqual([0.24, 0.58, 1])
  })

  it('maps brightness logarithmically within explicit luminance bounds', () => {
    expect(describeStarVisual(datum({ bright: -10 })).luminance).toBe(0.72)
    expect(describeStarVisual(datum({ bright: 0.5 })).luminance)
      .toBeCloseTo(0.72 + Math.log1p(2))
    expect(describeStarVisual(datum({ bright: 100 })).luminance).toBe(2.4)
  })

  it('uses clamped burst intensity for corona and surface activity', () => {
    const quiet = describeStarVisual(datum({ burst: -1 }))
    const active = describeStarVisual(datum({ burst: 0.6 }))
    const saturated = describeStarVisual(datum({ burst: 4 }))

    expect(quiet.surfaceActivity).toBe(0)
    expect(quiet.coronaScale).toBe(2.5)
    expect(active.surfaceActivity).toBe(0.6)
    expect(active.coronaScale).toBeCloseTo(3.4)
    expect(saturated.surfaceActivity).toBe(1)
    expect(saturated.coronaScale).toBe(4)
  })

  it('derives the same normalized integer seed on every call', () => {
    const star = datum({ seed: -42.9 })
    const first = describeStarVisual(star)
    const second = describeStarVisual(star)

    expect(first).toEqual(second)
    expect(first.seed).toBe(42)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.color)).toBe(true)
    const mutableColor = first.color as unknown as number[]
    expect(() => {
      mutableColor[0] = 0
    }).toThrow(TypeError)
    expect(first.color).toEqual([1, 1, 1])
    expect(star.seed).toBe(-42.9)
  })

  it('keeps the panorama core radius in its intended range', () => {
    const smallest = describeStarVisual(datum({ bright: -1 })).panoramaCorePx
    const largest = describeStarVisual(datum({ bright: 100 })).panoramaCorePx

    expect(smallest).toBe(2)
    expect(largest).toBeCloseTo(2 + Math.log1p(6) * 2.15)
    expect(smallest).toBeGreaterThanOrEqual(2)
    expect(largest).toBeLessThanOrEqual(7)
  })

  it('keeps the panorama halo radius in its intended range', () => {
    const smallest = describeStarVisual(datum({ bright: 0, burst: 0 })).panoramaHaloPx
    const largest = describeStarVisual(datum({ bright: 2, burst: 1 })).panoramaHaloPx

    expect(smallest).toBe(6)
    expect(largest).toBeCloseTo((2 + Math.log1p(6) * 2.15) * 4)
    expect(smallest).toBeGreaterThanOrEqual(6)
    expect(largest).toBeLessThanOrEqual(28)
  })

  it('falls back from NaN and Infinity to finite visible values', () => {
    const result = describeStarVisual(datum({
      bright: Number.NaN,
      burst: Number.POSITIVE_INFINITY,
      seed: Number.NEGATIVE_INFINITY,
      color: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    }))

    expect(result.color).toEqual([1, 1, 1])
    expect(result.luminance).toBeCloseTo(0.72 + Math.log1p(2))
    expect(result.surfaceActivity).toBe(0)
    expect(result.seed).toBe(1)
    expect(Object.values(result).flat()).toSatisfy(
      (values: unknown[]) => values.every((value) => typeof value === 'number' && Number.isFinite(value)),
    )
  })

  it('clamps finite color channels without mutating the input color', () => {
    const color: [number, number, number] = [1.4, -0.2, 0.55]
    const result = describeStarVisual(datum({ color }))

    expect(result.color).toEqual([1, 0, 0.55])
    expect(color).toEqual([1.4, -0.2, 0.55])
  })
})
