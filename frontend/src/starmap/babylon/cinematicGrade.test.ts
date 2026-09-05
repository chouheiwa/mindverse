import { describe, expect, it } from 'vitest'
import { QUALITY_LEVELS } from '../quality'
import { babylonCinematicEnvironment } from './cinematic'
import { babylonUpliftTier } from './visualUplift'
import { babylonCinematicGrade, spaceFogWindow } from './cinematicGrade'

const GRADES = QUALITY_LEVELS.map((quality) => [quality, babylonCinematicGrade(quality)] as const)

describe('cinematic grade', () => {
  it('keeps a lens on every tier: vignette, grade and grain all survive', () => {
    for (const [quality, grade] of GRADES) {
      expect(grade.vignetteWeight, `${quality} vignette`).toBeGreaterThan(0)
      expect(grade.grainIntensity, `${quality} grain`).toBeGreaterThan(0)
      expect(grade.highlightsWarmth, `${quality} grade`).not.toBe(0)
    }
  })

  it('stays restrained: the vignette never eats the frame', () => {
    for (const [, grade] of GRADES) {
      expect(grade.vignetteWeight).toBeLessThanOrEqual(2.2)
      expect(grade.grainIntensity).toBeLessThanOrEqual(6)
      expect(Math.abs(grade.shadowsCoolness)).toBeLessThanOrEqual(24)
      expect(Math.abs(grade.highlightsWarmth)).toBeLessThanOrEqual(24)
    }
  })

  it('lifts shadows cool and highlights warm, the split that reads as depth', () => {
    for (const [, grade] of GRADES) {
      // 暗部偏冷、亮部偏暖是「远近分离」在颜色上的表达：冷退、暖进。
      expect(grade.shadowsCoolness).toBeLessThan(0)
      expect(grade.highlightsWarmth).toBeGreaterThan(0)
    }
  })

  it('does not touch exposure or the restored bloom threshold', () => {
    for (const [quality, grade] of GRADES) {
      expect(grade.exposure).toBe(0.92)
      expect(grade.bloomThreshold).toBe(babylonCinematicEnvironment(quality).bloomThreshold)
    }
  })

  it('drops chromatic aberration first when the budget shrinks', () => {
    const [high, medium, low] = QUALITY_LEVELS.map(babylonCinematicGrade)
    expect(high!.chromaticAberration).toBeGreaterThanOrEqual(medium!.chromaticAberration)
    expect(medium!.chromaticAberration).toBeGreaterThanOrEqual(low!.chromaticAberration)
    expect(low!.chromaticAberration).toBe(0)
  })
})

describe('space fog window', () => {
  it('pulls the far plane in as fog thickens, so distance actually fades', () => {
    const thick = spaceFogWindow(60, 100, babylonUpliftTier('high'))
    const thin = spaceFogWindow(60, 100, babylonUpliftTier('low'))
    expect(thick.far).toBeLessThan(thin.far)
    expect(thick.near).toBeGreaterThan(0)
  })

  it('always leaves a usable window, however hostile the inputs', () => {
    for (const [radius, distance] of [[0, 0], [-5, 10], [Number.NaN, 40]] as const) {
      for (const quality of QUALITY_LEVELS) {
        const window = spaceFogWindow(radius, distance, babylonUpliftTier(quality))
        expect(Number.isFinite(window.near)).toBe(true)
        expect(Number.isFinite(window.far)).toBe(true)
        expect(window.far).toBeGreaterThan(window.near)
      }
    }
  })

  it('keeps the near plane in front of the camera as it closes in', () => {
    const far = spaceFogWindow(60, 200, babylonUpliftTier('high'))
    const close = spaceFogWindow(60, 20, babylonUpliftTier('high'))
    expect(close.near).toBeLessThan(far.near)
    expect(close.near).toBeGreaterThan(0)
  })
})
