import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js'
import { describe, expect, test } from 'vitest'
import {
  BABYLON_BLOOM_THRESHOLD,
  cappedDevicePixelRatio,
  configurePlanetImageProcessing,
} from './BabylonRenderer'

describe('Babylon planet rendering policy', () => {
  test('caps backing-store DPR by device class', () => {
    expect(cappedDevicePixelRatio(3, false)).toBe(2)
    expect(cappedDevicePixelRatio(3, true)).toBe(1.5)
    expect(cappedDevicePixelRatio(Number.NaN, false)).toBe(1)
    expect(cappedDevicePixelRatio(0, true)).toBe(1)
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
