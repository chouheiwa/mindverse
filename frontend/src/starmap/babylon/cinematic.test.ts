import { describe, expect, it } from 'vitest'
import { QUALITY_LEVELS, type Quality } from '../quality'
import { cinematicEnvironment } from '../gl/cinematic'
import {
  babylonBloomPolicy,
  babylonCinematicEnvironment,
  cappedDevicePixelRatio,
} from './cinematic'

/** Three renders every tier at DPR 2 (see Renderer.resize), so that is the ceiling to match. */
const THREE_DEVICE_PIXEL_RATIO = 2

describe('babylonCinematicEnvironment', () => {
  it('carries Three bloom intensity and threshold across every quality tier', () => {
    for (const quality of QUALITY_LEVELS) {
      const environment = babylonCinematicEnvironment(quality)
      expect(environment.bloomWeight).toBeCloseTo(cinematicEnvironment(quality).bloom, 6)
      // Three's BloomEffect luminanceThreshold; the previous 1.05 sat above
      // everything the star shaders could emit, so nothing ever bloomed.
      expect(environment.bloomThreshold).toBeCloseTo(0.68, 6)
    }
  })

  it('widens the bloom kernel with quality without ever disabling it', () => {
    const [high, medium, low] = QUALITY_LEVELS.map(babylonCinematicEnvironment)
    expect(high.bloomKernel).toBeGreaterThan(medium.bloomKernel)
    expect(medium.bloomKernel).toBeGreaterThan(low.bloomKernel)
    for (const environment of [high, medium, low]) {
      expect(environment.bloomKernel).toBeGreaterThan(0)
      expect(environment.bloomScale).toBeGreaterThan(0)
      expect(environment.bloomScale).toBeLessThanOrEqual(1)
    }
  })

  it('restores antialiasing on every tier and matches Three multisampling at high', () => {
    for (const quality of QUALITY_LEVELS) {
      const environment = babylonCinematicEnvironment(quality)
      const antialiased = environment.multisampling > 1 || environment.fxaa
      expect(antialiased, `${quality} must not render without antialiasing`).toBe(true)
    }
    expect(babylonCinematicEnvironment('high').multisampling)
      .toBe(cinematicEnvironment('high').multisampling)
  })

  it('restores the Three backing-store resolution at high and tiers the rest', () => {
    const [high, medium, low] = QUALITY_LEVELS.map(babylonCinematicEnvironment)
    expect(high.maxDevicePixelRatio).toBe(THREE_DEVICE_PIXEL_RATIO)
    expect(medium.maxDevicePixelRatio).toBeLessThan(high.maxDevicePixelRatio)
    expect(low.maxDevicePixelRatio).toBeLessThan(medium.maxDevicePixelRatio)
    // The regression this replaces flattened every desktop tier to 1.25.
    expect(low.maxDevicePixelRatio).toBeGreaterThan(1.25)
    for (const environment of [high, medium, low]) {
      expect(environment.mobileDevicePixelRatio).toBeGreaterThan(0)
      expect(environment.mobileDevicePixelRatio).toBeLessThanOrEqual(environment.maxDevicePixelRatio)
    }
  })

  it('never spends more samples per CSS pixel than the Three tier it replaces', () => {
    for (const quality of QUALITY_LEVELS) {
      const reference = cinematicEnvironment(quality)
      const environment = babylonCinematicEnvironment(quality)
      const referenceBudget = THREE_DEVICE_PIXEL_RATIO ** 2 * Math.max(1, reference.multisampling)
      const budget = environment.maxDevicePixelRatio ** 2 * Math.max(1, environment.multisampling)
      expect(budget, `${quality} sample budget`).toBeLessThanOrEqual(referenceBudget + 1e-6)
    }
  })
})

describe('babylonBloomPolicy', () => {
  it('keeps bloom on in the panorama at every quality, high included', () => {
    for (const quality of QUALITY_LEVELS) {
      expect(babylonBloomPolicy('panorama', quality).enabled, `${quality} panorama bloom`).toBe(true)
    }
  })

  it('spends a wider kernel on focused scenes than on the panorama', () => {
    for (const quality of QUALITY_LEVELS) {
      const panorama = babylonBloomPolicy('panorama', quality)
      const focus = babylonBloomPolicy('planet-focus', quality)
      const strata = babylonBloomPolicy('strata', quality)
      expect(focus.kernel).toBeGreaterThanOrEqual(panorama.kernel)
      expect(focus.enabled).toBe(true)
      expect(strata.enabled).toBe(true)
      expect(babylonBloomPolicy('star-focus', quality)).toEqual(focus)
    }
  })

  it('scales every phase kernel with quality', () => {
    for (const phase of ['panorama', 'star-focus', 'planet-focus', 'strata'] as const) {
      expect(babylonBloomPolicy(phase, 'high').kernel)
        .toBeGreaterThan(babylonBloomPolicy(phase, 'low').kernel)
    }
  })
})

describe('cappedDevicePixelRatio', () => {
  const tiers: readonly Quality[] = QUALITY_LEVELS

  it('honours the tier ceiling instead of a single desktop cap', () => {
    expect(cappedDevicePixelRatio(3, false, 'high')).toBe(2)
    expect(cappedDevicePixelRatio(3, false, 'medium'))
      .toBe(babylonCinematicEnvironment('medium').maxDevicePixelRatio)
    expect(cappedDevicePixelRatio(3, false, 'low'))
      .toBe(babylonCinematicEnvironment('low').maxDevicePixelRatio)
  })

  it('never upsamples a low-density display and stays finite', () => {
    for (const quality of tiers) {
      expect(cappedDevicePixelRatio(1, false, quality)).toBe(1)
      expect(cappedDevicePixelRatio(Number.NaN, false, quality)).toBe(1)
      expect(cappedDevicePixelRatio(0, true, quality)).toBe(1)
      expect(cappedDevicePixelRatio(3, true, quality))
        .toBe(babylonCinematicEnvironment(quality).mobileDevicePixelRatio)
    }
  })
})

describe('first-frame bake budget', () => {
  it('keeps the one-off nebula bake small enough for a software rasteriser', () => {
    // Three shells x six cube faces of domain-warped fbm all land on the first
    // frames. At 512 that is 4.7M pixels of ~30 simplex samples each, which
    // stalls SwiftShader for seconds and starves the time-based camera flight.
    for (const quality of QUALITY_LEVELS) {
      const { nebulaBake } = babylonCinematicEnvironment(quality)
      const bakedPixels = 3 * 6 * nebulaBake * nebulaBake
      expect(bakedPixels, `${quality} bake budget`).toBeLessThanOrEqual(1_200_000)
    }
  })

  it('still lowers bake resolution with quality and keeps all three shells', () => {
    const sizes = QUALITY_LEVELS.map((quality) => babylonCinematicEnvironment(quality).nebulaBake)
    expect(sizes[0]).toBeGreaterThan(sizes[1]!)
    expect(sizes[1]).toBeGreaterThan(sizes[2]!)
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(64)
  })
})
