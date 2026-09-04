import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js'
import { describe, expect, test } from 'vitest'
import {
  BABYLON_BLOOM_THRESHOLD,
  babylonBloomPolicy,
  cappedDevicePixelRatio,
  configurePlanetImageProcessing,
  elapsedRenderDelta,
  materializedPlanetsForStar,
  shouldUpdateMaterializedPlanet,
} from './BabylonRenderer'

describe('Babylon planet rendering policy', () => {
  test('caps backing-store DPR by device class', () => {
    expect(cappedDevicePixelRatio(3, false)).toBe(1.25)
    expect(cappedDevicePixelRatio(3, true)).toBe(1)
    expect(cappedDevicePixelRatio(Number.NaN, false)).toBe(1)
    expect(cappedDevicePixelRatio(0, true)).toBe(1)
  })

  test('keeps panorama bloom off its expensive path and restores it for detailed scenes', () => {
    expect(babylonBloomPolicy('panorama')).toEqual({ enabled: false, kernel: 16 })
    expect(babylonBloomPolicy('star-focus')).toEqual({ enabled: true, kernel: 32 })
    expect(babylonBloomPolicy('planet-focus')).toEqual({ enabled: true, kernel: 32 })
    expect(babylonBloomPolicy('strata')).toEqual({ enabled: true, kernel: 24 })
  })

  test('materializes no planets in panorama and only the current star system on demand', () => {
    const first = { star: { s: { id: 'star-a' } }, question: { id: 'q-a' } }
    const second = { star: { s: { id: 'star-b' } }, question: { id: 'q-b' } }
    const planets = [first, second] as any

    expect(materializedPlanetsForStar(planets, null)).toEqual([])
    expect(materializedPlanetsForStar(planets, first.star as any)).toEqual([first])
    expect(materializedPlanetsForStar(planets, second.star as any)).toEqual([second])
  })

  test('rejects hidden planets before position, distance, LOD or uniform work', () => {
    expect(shouldUpdateMaterializedPlanet(false, true)).toBe(false)
    expect(shouldUpdateMaterializedPlanet(true, false)).toBe(false)
    expect(shouldUpdateMaterializedPlanet(true, true)).toBe(true)
  })

  test('advances animation by elapsed wall time between actual renders and caps a hidden-page gap', () => {
    expect(elapsedRenderDelta(null, 1_000, 8)).toBe(8)
    expect(elapsedRenderDelta(1_000, 1_034, 8)).toBe(34)
    expect(elapsedRenderDelta(1_000, 5_000, 8)).toBe(50)
    expect(elapsedRenderDelta(1_000, Number.NaN, 8)).toBe(8)
  })

  test('uses KHR PBR Neutral, dithering and a bloom threshold above ordinary surface output', () => {
    const configuration = {
      toneMappingEnabled: false,
      toneMappingType: -1,
      ditheringEnabled: false,
      exposure: 0,
    }
    configurePlanetImageProcessing(configuration)
    expect(configuration.toneMappingEnabled).toBe(true)
    expect(configuration.toneMappingType).toBe(ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL)
    expect(configuration.ditheringEnabled).toBe(true)
    expect(BABYLON_BLOOM_THRESHOLD).toBeGreaterThanOrEqual(1)
  })
})
