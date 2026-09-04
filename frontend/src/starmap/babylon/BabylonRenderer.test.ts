import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js'
import { describe, expect, test } from 'vitest'
import {
  BABYLON_BLOOM_THRESHOLD,
  advanceTransitionElapsed,
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
    expect(elapsedRenderDelta(null, 1_000)).toBe(0)
    expect(elapsedRenderDelta(1_000, 1_034)).toBe(34)
    expect(elapsedRenderDelta(1_000, 5_000)).toBe(50)
    expect(elapsedRenderDelta(1_000, Number.NaN)).toBe(0)
  })

  test('advances a 60 Hz transition by rendered wall time when its source RAF runs at 120 Hz', () => {
    const sourceRafDelta = 1_000 / 120
    const renderedAt = [0, sourceRafDelta * 2, sourceRafDelta * 4, sourceRafDelta * 6]
    let elapsed = 0
    for (let index = 1; index < renderedAt.length; index += 1) {
      elapsed = advanceTransitionElapsed(elapsed, renderedAt[index - 1], renderedAt[index])
    }

    expect(elapsed).toBeCloseTo(50)
    expect(elapsed).not.toBeCloseTo(sourceRafDelta * 3)
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
