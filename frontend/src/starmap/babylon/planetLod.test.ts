import { describe, expect, test } from 'vitest'
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

describe('planet LOD selection', () => {
  test('selects initial levels and reserves high LOD for the focused planet', () => {
    expect(initialPlanetLod(0.044, false)).toBe('low')
    expect(initialPlanetLod(0.045, false)).toBe('medium')
    expect(initialPlanetLod(0.22, true)).toBe('high')
    expect(initialPlanetLod(0.9, false)).toBe('medium')
  })

  test('applies low/medium and medium/high hysteresis', () => {
    expect(nextPlanetLod('low', 0.044, false)).toBe('low')
    expect(nextPlanetLod('low', 0.045, false)).toBe('medium')
    expect(nextPlanetLod('medium', 0.03, false)).toBe('medium')
    expect(nextPlanetLod('medium', 0.029, false)).toBe('low')
    expect(nextPlanetLod('medium', 0.20, true)).toBe('medium')
    expect(nextPlanetLod('medium', 0.22, true)).toBe('high')
    expect(nextPlanetLod('high', 0.17, true)).toBe('high')
    expect(nextPlanetLod('high', 0.15, true)).toBe('medium')
  })

  test('immediately demotes high LOD when focus is lost and sanitizes coverage', () => {
    expect(nextPlanetLod('high', 0.5, false)).toBe('medium')
    expect(initialPlanetLod(Number.NaN, true)).toBe('low')
    expect(nextPlanetLod('medium', Number.POSITIVE_INFINITY, true)).toBe('low')
  })
})
