import { describe, expect, it } from 'vitest'
import { QUALITY_LEVELS, type Quality } from '../quality'
import {
  UPLIFT_EFFECT_CATEGORIES,
  babylonUpliftTier,
  upliftCategoryPresence,
} from './visualUplift'

const TIERS = QUALITY_LEVELS.map((quality) => [quality, babylonUpliftTier(quality)] as const)

describe('uplift quality tiers', () => {
  it('keeps every effect category alive at every tier', () => {
    // 分档只能降规格，不能删类别。旧实现的教训是「low 直接关 bloom」——
    // 省下来的填充率买到的是「那一屏最该发光的东西不发光」。
    for (const [quality, tier] of TIERS) {
      const presence = upliftCategoryPresence(tier)
      for (const category of UPLIFT_EFFECT_CATEGORIES) {
        expect(presence[category], `${quality} dropped ${category}`).toBe(true)
      }
    }
  })

  it('scales density monotonically from high through medium to low', () => {
    const [high, medium, low] = QUALITY_LEVELS.map(babylonUpliftTier)
    const ladders: readonly (readonly [string, number, number, number])[] = [
      ['starfieldCount', high!.starfieldCount, medium!.starfieldCount, low!.starfieldCount],
      ['starSpotCount', high!.starSpotCount, medium!.starSpotCount, low!.starSpotCount],
      ['starProminenceCount', high!.starProminenceCount, medium!.starProminenceCount, low!.starProminenceCount],
      ['coronaStreamerCount', high!.coronaStreamerCount, medium!.coronaStreamerCount, low!.coronaStreamerCount],
      ['planetCloudOctaves', high!.planetCloudOctaves, medium!.planetCloudOctaves, low!.planetCloudOctaves],
      ['granulationOctaves', high!.granulationOctaves, medium!.granulationOctaves, low!.granulationOctaves],
      ['probeAccentLights', high!.probeAccentLights, medium!.probeAccentLights, low!.probeAccentLights],
      ['strataLaminationBands', high!.strataLaminationBands, medium!.strataLaminationBands, low!.strataLaminationBands],
    ]
    for (const [name, highValue, mediumValue, lowValue] of ladders) {
      expect(highValue, `${name} high >= medium`).toBeGreaterThanOrEqual(mediumValue)
      expect(mediumValue, `${name} medium >= low`).toBeGreaterThanOrEqual(lowValue)
      expect(lowValue, `${name} low > 0`).toBeGreaterThan(0)
    }
  })

  it('never lets a lower tier cost more than a higher one', () => {
    const cost = (quality: Quality) => {
      const tier = babylonUpliftTier(quality)
      return tier.starfieldCount + tier.starSpotCount * 8 + tier.coronaStreamerCount * 4
        + tier.planetCloudOctaves * 32 + tier.granulationOctaves * 32
    }
    expect(cost('high')).toBeGreaterThanOrEqual(cost('medium'))
    expect(cost('medium')).toBeGreaterThanOrEqual(cost('low'))
  })

  it('holds the starfield to three depth strata at every tier', () => {
    // 纵深来自分层视差，不是来自数量。抽稀可以，抽掉一整层不行 ——
    // 那样星场会塌成一张贴纸。
    for (const [, tier] of TIERS) expect(tier.starfieldStrata).toBe(3)
  })

  it('keeps the field restrained: never a white wash', () => {
    for (const [quality, tier] of TIERS) {
      expect(tier.starfieldCount, `${quality} starfield is not a wash`).toBeLessThanOrEqual(2600)
      expect(tier.starfieldPeakAlpha).toBeLessThanOrEqual(0.9)
    }
  })
})
