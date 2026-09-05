import { describe, expect, it } from 'vitest'
import { QUALITY_LEVELS } from '../quality'
import { babylonUpliftTier } from './visualUplift'
import {
  STRATA_GUIDE_COLOR,
  strataDepthFog,
  strataGuideLight,
  strataSpecimenHalo,
} from './strataAtmosphere'

describe('strata depth fog', () => {
  it('darkens and cools as the shaft goes deeper', () => {
    const shallow = strataDepthFog(0, 40)
    const deep = strataDepthFog(38, 40)
    const luminance = (rgb: readonly [number, number, number]) =>
      rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
    expect(luminance(deep.color)).toBeLessThan(luminance(shallow.color))
    expect(deep.density).toBeGreaterThan(shallow.density)
  })

  it('never fogs the shaft opaque, or the layers stop reading', () => {
    for (const depth of [0, 5, 20, 100, 1000]) {
      const fog = strataDepthFog(depth, 40)
      expect(fog.density).toBeGreaterThan(0)
      expect(fog.density).toBeLessThan(0.06)
    }
  })

  it('survives a degenerate shaft', () => {
    const fog = strataDepthFog(Number.NaN, 0)
    expect(Number.isFinite(fog.density)).toBe(true)
    for (const channel of fog.color) expect(Number.isFinite(channel)).toBe(true)
  })
})

describe('strata guide light', () => {
  it('hangs above the traveller and points down the shaft', () => {
    const guide = strataGuideLight(12, babylonUpliftTier('high'))
    expect(guide.y).toBeGreaterThan(-12)
    expect(guide.intensity).toBeGreaterThan(0)
    expect(STRATA_GUIDE_COLOR[2]).toBeGreaterThan(STRATA_GUIDE_COLOR[0])
  })

  it('follows the traveller down instead of staying at the mouth', () => {
    expect(strataGuideLight(30, babylonUpliftTier('high')).y)
      .toBeLessThan(strataGuideLight(4, babylonUpliftTier('high')).y)
  })

  it('keeps a guide at every tier, only dimmer', () => {
    const intensities = QUALITY_LEVELS.map(
      (quality) => strataGuideLight(10, babylonUpliftTier(quality)).intensity,
    )
    for (const intensity of intensities) expect(intensity).toBeGreaterThan(0)
    expect(intensities[0]!).toBeGreaterThan(intensities[2]!)
  })
})

describe('strata specimen halo', () => {
  it('scales the halo with how much the answer carries', () => {
    const small = strataSpecimenHalo({ scale: 0.5, created: false, collected: false })
    const large = strataSpecimenHalo({ scale: 2, created: false, collected: false })
    expect(large.radius).toBeGreaterThan(small.radius)
  })

  it('marks what the reader did with the answer, warm for created, cool for collected', () => {
    const created = strataSpecimenHalo({ scale: 1, created: true, collected: false })
    const collected = strataSpecimenHalo({ scale: 1, created: false, collected: true })
    const neutral = strataSpecimenHalo({ scale: 1, created: false, collected: false })
    expect(created.color[0]).toBeGreaterThan(created.color[2])
    expect(collected.color[2]).toBeGreaterThan(collected.color[0])
    expect(created.intensity).toBeGreaterThan(neutral.intensity)
    // 没读过也没写过的答案仍然是一个节点，不是一块石头。
    expect(neutral.intensity).toBeGreaterThan(0)
  })
})
