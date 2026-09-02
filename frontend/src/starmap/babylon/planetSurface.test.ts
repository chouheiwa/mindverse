import { describe, expect, test } from 'vitest'
import { buildPlanetSurfaceDescriptor, incidentEnergy, thermalWeights } from './planetSurface'

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
})
