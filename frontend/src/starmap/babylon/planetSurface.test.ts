import { describe, expect, test } from 'vitest'
import {
  buildPlanetSurfaceDescriptor,
  incidentEnergy,
  stablePlanetSeed,
  thermalWeights,
} from './planetSurface'

describe('Babylon planet surface inputs', () => {
  test('uses normalized inverse-square incident energy', () => {
    expect(incidentEnergy(0.8, 1)).toBe(0.8)
    expect(incidentEnergy(0.8, 2)).toBe(0.2)
    expect(incidentEnergy(-1, 0)).toBe(0)
    expect(Number.isFinite(incidentEnergy(1, 0))).toBe(true)
  })

  test.each([
    [1.8, 'magma'],
    [0.8, 'desert'],
    [0.42, 'rock'],
    [0.2, 'tundra'],
    [0.01, 'ice'],
  ] as const)('maps incident %s toward %s without a hard whole-planet switch', (incident, dominant) => {
    const weights = thermalWeights(incident)
    const total = Object.values(weights).reduce((sum, value) => sum + value, 0)

    expect(total).toBeCloseTo(1, 8)
    expect(weights[dominant]).toBeGreaterThanOrEqual(Math.max(...Object.values(weights)))
  })

  test('blends adjacent thermal states continuously around every center', () => {
    for (const center of [1.4, 0.8, 0.42, 0.2, 0.06]) {
      const left = thermalWeights(center - 0.0001)
      const right = thermalWeights(center + 0.0001)
      const delta = Object.keys(left).reduce((sum, key) =>
        sum + Math.abs(left[key as keyof typeof left] - right[key as keyof typeof right]), 0)
      expect(delta).toBeLessThan(0.01)
    }
  })

  test('derives terrain from answer evidence and never from article count', () => {
    const evidence = {
      questionId: 'question:7', starId: 'star:alpha', answerCount: 24,
      timeSpan: 365 * 86_400, freshness: 0.7, created: true, collected: true,
      normalizedStarEnergy: 0.9, normalizedOrbitDistance: 1.5,
    }
    const fewArticlesInput = { ...evidence, articleCount: 0 }
    const manyArticlesInput = { ...evidence, articleCount: 20_000 }
    const fewArticles = buildPlanetSurfaceDescriptor(fewArticlesInput)
    const manyArticles = buildPlanetSurfaceDescriptor(manyArticlesInput)

    expect(fewArticles).toEqual(manyArticles)
    expect(fewArticles.metadata).toEqual({ questionId: 'question:7', starId: 'star:alpha' })
    expect(Object.keys(fewArticles.metadata)).toEqual(['questionId', 'starId'])
    expect(fewArticles.radius).toBeGreaterThan(0)
    expect(fewArticles.craterCount).toBeGreaterThan(0)
    expect(fewArticles.faultStrength).toBeGreaterThan(0)
  })

  test('sanitizes every shader-facing field and derives a stable uint32 seed', () => {
    const descriptor = buildPlanetSurfaceDescriptor({
      questionId: 'q:7', starId: 's:2', answerCount: Number.NaN,
      timeSpan: Number.POSITIVE_INFINITY, freshness: -4,
      created: false, collected: false,
      normalizedStarEnergy: Number.NaN, normalizedOrbitDistance: -1,
    })
    const sanitized = buildPlanetSurfaceDescriptor({
      questionId: 'q:7', starId: 's:2', answerCount: 0,
      timeSpan: 0, freshness: 0,
      created: false, collected: false,
      normalizedStarEnergy: 0, normalizedOrbitDistance: 1,
    })

    expect(descriptor.seed).toBe(sanitized.seed)
    expect(Number.isInteger(descriptor.seed)).toBe(true)
    expect(descriptor.seed).toBeGreaterThanOrEqual(0)
    expect(descriptor.seed).toBeLessThanOrEqual(0xffff_ffff)
    expect(descriptor).toMatchObject({
      radius: 0.55,
      craterCount: 5,
      detailDensity: 0,
      faultStrength: 0,
      atmosphere: 0,
      createdGlow: 0,
      collectedMarker: 0,
      incident: 0,
    })
    expect(Object.values(descriptor.thermal).every(Number.isFinite)).toBe(true)
    expect(Object.values(descriptor.thermal).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8)
    expect(descriptor.thermal.ice).toBe(1)
  })

  test('keeps every public numeric descriptor field within its contract boundaries', () => {
    const maximum = buildPlanetSurfaceDescriptor({
      questionId: 'max', starId: 'bounds', answerCount: Number.POSITIVE_INFINITY,
      timeSpan: Number.NEGATIVE_INFINITY, freshness: Number.POSITIVE_INFINITY,
      created: true, collected: true,
      normalizedStarEnergy: Number.POSITIVE_INFINITY,
      normalizedOrbitDistance: Number.NaN,
    })
    const saturated = buildPlanetSurfaceDescriptor({
      questionId: 'max', starId: 'bounds', answerCount: Number.MAX_VALUE,
      timeSpan: Number.MAX_VALUE, freshness: Number.MAX_VALUE,
      created: true, collected: true,
      normalizedStarEnergy: Number.MAX_VALUE,
      normalizedOrbitDistance: Number.MIN_VALUE,
    })

    for (const descriptor of [maximum, saturated]) {
      expect(descriptor.radius).toBeGreaterThanOrEqual(0.55)
      expect(descriptor.radius).toBeLessThanOrEqual(1)
      expect(descriptor.craterCount).toBeGreaterThanOrEqual(5)
      expect(descriptor.craterCount).toBeLessThanOrEqual(48)
      expect(descriptor.detailDensity).toBeGreaterThanOrEqual(0)
      expect(descriptor.detailDensity).toBeLessThanOrEqual(1)
      expect(descriptor.faultStrength).toBeGreaterThanOrEqual(0)
      expect(descriptor.faultStrength).toBeLessThanOrEqual(1)
      expect(descriptor.atmosphere).toBeGreaterThanOrEqual(0)
      expect(descriptor.atmosphere).toBeLessThanOrEqual(1)
      expect(descriptor.incident).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(descriptor.incident)).toBe(true)
      expect([0, 1]).toContain(descriptor.createdGlow)
      expect([0, 1]).toContain(descriptor.collectedMarker)
      expect(Object.values(descriptor.thermal).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 8)
    }
  })

  test('hashes identity deterministically without leaving the uint32 range', () => {
    expect(stablePlanetSeed('q:7', 's:2')).toBe(stablePlanetSeed('q:7', 's:2'))
    expect(stablePlanetSeed('q:7', 's:2')).not.toBe(stablePlanetSeed('q:7', 's:3'))
    expect(stablePlanetSeed('\ud83c\udf0d', '\ud83c\udf1f')).toBeGreaterThanOrEqual(0)
    expect(stablePlanetSeed('\ud83c\udf0d', '\ud83c\udf1f')).toBeLessThanOrEqual(0xffff_ffff)
  })
})
