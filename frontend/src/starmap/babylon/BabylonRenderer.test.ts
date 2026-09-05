import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js'
import { describe, expect, test } from 'vitest'
import {
  BABYLON_BLOOM_THRESHOLD,
  advanceTransitionElapsed,
  babylonBloomPolicy,
  cappedDevicePixelRatio,
  configurePlanetImageProcessing,
  elapsedRenderDelta,
  flightElapsedMs,
  materializedPlanetsForStar,
  shouldUpdateMaterializedPlanet,
} from './BabylonRenderer'
import { QUALITY_LEVELS } from '../quality'
import { babylonCinematicEnvironment } from './cinematic'
import { radianceLuminance, starSurfaceRadiance } from './stellarRadiance'

describe('Babylon planet rendering policy', () => {
  test('caps backing-store DPR by quality tier and device class', () => {
    expect(cappedDevicePixelRatio(3, false, 'high')).toBe(2)
    expect(cappedDevicePixelRatio(3, false, 'low'))
      .toBe(babylonCinematicEnvironment('low').maxDevicePixelRatio)
    expect(cappedDevicePixelRatio(3, true, 'high'))
      .toBe(babylonCinematicEnvironment('high').mobileDevicePixelRatio)
    expect(cappedDevicePixelRatio(Number.NaN, false, 'high')).toBe(1)
    expect(cappedDevicePixelRatio(0, true, 'low')).toBe(1)
  })

  test('keeps bloom lit in every phase and widens the kernel for detailed scenes', () => {
    for (const quality of QUALITY_LEVELS) {
      for (const phase of ['panorama', 'star-focus', 'planet-focus', 'strata'] as const) {
        expect(babylonBloomPolicy(phase, quality).enabled, `${quality}/${phase}`).toBe(true)
      }
      expect(babylonBloomPolicy('planet-focus', quality).kernel)
        .toBeGreaterThanOrEqual(babylonBloomPolicy('panorama', quality).kernel)
    }
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

  test('lets a camera flight finish on wall time even when frames arrive slowly', () => {
    // Animation deltas are capped at 50 ms so a hidden tab cannot teleport the
    // scene, but the flight itself is a fixed-duration transition: accumulating
    // capped deltas leaves it stuck short of 1 on a slow rasteriser and the UI
    // never leaves "approaching".
    // Wall time is the ceiling: a slow frame catches the flight up instead of
    // leaving it stuck short of 1.
    expect(flightElapsedMs(0, 1_000, 900, 800)).toBeCloseTo(900, 6)
    expect(flightElapsedMs(200, 400, 900, 0)).toBeCloseTo(112.5, 6)
    expect(flightElapsedMs(200, 100, 900, 0)).toBeCloseTo(0, 6)
    expect(flightElapsedMs(Number.NaN, 500, 900, 0)).toBeCloseTo(900, 6)
  })

  test('never skips more than an eighth of a flight in one frame', () => {
    // Otherwise a 500 ms software frame jumps the camera straight to the end and
    // the approach reveal is never seen.
    const duration = 800
    let elapsed = 0
    const frames: number[] = []
    for (let frame = 0; frame < 12; frame += 1) {
      elapsed = flightElapsedMs(0, 10_000, duration, elapsed)
      frames.push(elapsed / duration)
      if (elapsed >= duration) break
    }
    expect(frames.length).toBeGreaterThanOrEqual(8)
    expect(frames.some((progress) => progress > 0.55 && progress < 0.98)).toBe(true)
    expect(frames[frames.length - 1]).toBeCloseTo(1, 6)
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
    // The threshold must sit under what the star shaders actually emit,
    // otherwise the bloom pass has nothing to pick up.
    expect(BABYLON_BLOOM_THRESHOLD).toBe(babylonCinematicEnvironment('high').bloomThreshold)
    expect(BABYLON_BLOOM_THRESHOLD).toBeLessThan(radianceLuminance(starSurfaceRadiance({
      kelvin: 12_288, color: [0.51, 0.74, 1], facing: 1, granulation: 0.5, cellular: 0.5, activity: 0,
    })))
  })
})
