import { describe, expect, test } from 'vitest'
import { buildPlanetSurfaceDescriptor } from './planetSurface'
import { buildPlanetTerrain } from './planetTerrain'

const descriptor = buildPlanetSurfaceDescriptor({
  questionId: 'question:terrain',
  starId: 'star:alpha',
  answerCount: 30,
  timeSpan: 365 * 86_400,
  freshness: 0.7,
  created: false,
  collected: false,
  normalizedStarEnergy: 0.8,
  normalizedOrbitDistance: 1.2,
})

describe('Babylon deterministic planet terrain', () => {
  test('builds stable bounded crater parameters without Babylon dependencies', () => {
    const first = buildPlanetTerrain(descriptor, 'medium')
    const second = buildPlanetTerrain(descriptor, 'medium')

    expect(first).toEqual(second)
    expect(first.octaves).toBe(5)
    expect(first.largeCraters.length).toBeLessThanOrEqual(8)
    expect(first.largeCraters.length + first.smallCraterBudget).toBe(descriptor.craterCount)
    for (const crater of first.largeCraters) {
      expect(Math.hypot(...crater.direction)).toBeCloseTo(1, 5)
      expect(crater.radius).toBeGreaterThan(0)
      expect(crater.depth).toBeGreaterThan(0)
      expect(crater.rim).toBeGreaterThan(0)
    }
  })

  test('uses the same ordered large-crater prefix across terrain levels', () => {
    const low = buildPlanetTerrain(descriptor, 'low')
    const medium = buildPlanetTerrain(descriptor, 'medium')
    const high = buildPlanetTerrain(descriptor, 'high')

    expect(low.octaves).toBe(3)
    expect(high.octaves).toBe(6)
    expect(medium.largeCraters.slice(0, low.largeCraters.length)).toEqual(low.largeCraters)
    expect(high.largeCraters.slice(0, medium.largeCraters.length)).toEqual(medium.largeCraters)
  })

  test('disables hashed small craters at low LOD and budgets them at higher LODs', () => {
    const low = buildPlanetTerrain(descriptor, 'low')
    const medium = buildPlanetTerrain(descriptor, 'medium')
    const high = buildPlanetTerrain(descriptor, 'high')

    expect(low.smallCraterBudget).toBe(0)
    expect(low.smallCraterThreshold).toBe(0)
    expect(medium.smallCraterBudget).toBe(descriptor.craterCount - medium.largeCraters.length)
    expect(high.smallCraterBudget).toBe(descriptor.craterCount - high.largeCraters.length)
    expect(medium.smallCraterThreshold).toBeGreaterThan(0)
    expect(medium.smallCraterThreshold).toBeLessThanOrEqual(1)
    expect(high.smallCraterThreshold).toBe(medium.smallCraterThreshold)
  })

  test('keeps crater counts and generated parameters bounded for descriptor extremes', () => {
    for (const answerCount of [0, Number.MAX_VALUE]) {
      const terrainDescriptor = buildPlanetSurfaceDescriptor({
        questionId: `question:${answerCount}`,
        starId: 'star:bounds',
        answerCount,
        timeSpan: null,
        freshness: 0,
        created: false,
        collected: false,
        normalizedStarEnergy: 0,
        normalizedOrbitDistance: 1,
      })
      const terrain = buildPlanetTerrain(terrainDescriptor, 'high')

      expect(terrain.largeCraters.length).toBeGreaterThanOrEqual(2)
      expect(terrain.largeCraters.length).toBeLessThanOrEqual(8)
      expect(terrain.largeCraters.length + terrain.smallCraterBudget).toBe(terrainDescriptor.craterCount)
      expect(terrain.warpStrength).toBeGreaterThanOrEqual(0)
      expect(terrain.warpStrength).toBeLessThanOrEqual(1)
      expect(terrain.ridgeStrength).toBeGreaterThanOrEqual(0)
      expect(terrain.ridgeStrength).toBeLessThanOrEqual(1)
    }
  })
})
