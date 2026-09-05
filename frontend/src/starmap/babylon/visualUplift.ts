import type { Quality } from '../quality'

// 提升批次的画质分档。
//
// 与 cinematic.ts 分开，是因为那个文件的契约是「只还原 Three 已有的能力」。
// 这里是新增的电影化效果，它有一条自己的不变量，写在 visualUplift.test.ts 里：
//
//   **分档只降规格，不删类别。**
//
// 恢复批次已经吃过一次「low 直接关 bloom」的亏 —— 省下来的填充率买到的是
// 「那一屏最该发光的东西反而不发光」。所以每一个类别在三个档位上都必须 > 0，
// 由 `upliftCategoryPresence` 逐档断言。

/** 效果类别清单。新增效果必须同时进这张表，否则分档不变量抓不到它。 */
export const UPLIFT_EFFECT_CATEGORIES = Object.freeze([
  'starfield',
  'starSpots',
  'starGranulation',
  'starProminences',
  'coronaStreamers',
  'starDiffraction',
  'planetClouds',
  'planetNightSide',
  'planetAtmosphere',
  'probeAccentLights',
  'probeThruster',
  'strataLaminations',
  'strataGuideLight',
  'spaceFog',
] as const)

export type UpliftEffectCategory = typeof UPLIFT_EFFECT_CATEGORIES[number]

export interface BabylonUpliftTier {
  /** 背景星场的粒数。克制：三档都远低于「白茫茫一片」。 */
  readonly starfieldCount: number
  /** 星场的景深层数。恒为 3 —— 纵深来自分层视差，不是来自数量。 */
  readonly starfieldStrata: 3
  /** 星场最亮一粒的 alpha 上限，防止背景被点阵刷白。 */
  readonly starfieldPeakAlpha: number
  /** 恒星表面米粒组织的噪声八度。 */
  readonly granulationOctaves: number
  /** 星斑（暗）数量。暗特征在 bloom 之后仍然可见，是「实体感」的主要来源。 */
  readonly starSpotCount: number
  /** 日珥 / 喷发弧的数量。 */
  readonly starProminenceCount: number
  /** 日冕流苏（helmet streamer）的数量。 */
  readonly coronaStreamerCount: number
  /** 聚焦恒星的衍射星芒条数（primary spikes）。 */
  readonly diffractionSpikeCount: number
  /** 行星云层的噪声八度。 */
  readonly planetCloudOctaves: number
  /** 夜侧灯火的采样密度系数。 */
  readonly planetNightDensity: number
  /** 大气壳的散射采样档（0 = 只有 Rayleigh 近似，仍然有大气）。 */
  readonly atmosphereScatteringLevel: number
  /** 探测器上的局部补光数量。 */
  readonly probeAccentLights: number
  /** 推进器尾焰的分段数。 */
  readonly probeThrusterSegments: number
  /** 地层纹层的频带数。 */
  readonly strataLaminationBands: number
  /** 地层引导光的强度系数。 */
  readonly strataGuideIntensity: number
  /** 空间雾的密度系数：给宇宙纵深，不能糊成牛奶。 */
  readonly spaceFogDensity: number
}

const TIERS: Readonly<Record<Quality, BabylonUpliftTier>> = Object.freeze({
  high: Object.freeze({
    starfieldCount: 2400,
    starfieldStrata: 3,
    starfieldPeakAlpha: 0.82,
    granulationOctaves: 4,
    starSpotCount: 5,
    starProminenceCount: 4,
    coronaStreamerCount: 7,
    diffractionSpikeCount: 6,
    planetCloudOctaves: 4,
    planetNightDensity: 1,
    atmosphereScatteringLevel: 2,
    probeAccentLights: 3,
    probeThrusterSegments: 5,
    strataLaminationBands: 3,
    strataGuideIntensity: 1,
    spaceFogDensity: 1,
  }),
  medium: Object.freeze({
    starfieldCount: 1500,
    starfieldStrata: 3,
    starfieldPeakAlpha: 0.78,
    granulationOctaves: 3,
    starSpotCount: 4,
    starProminenceCount: 3,
    coronaStreamerCount: 5,
    diffractionSpikeCount: 4,
    planetCloudOctaves: 3,
    planetNightDensity: 0.78,
    atmosphereScatteringLevel: 2,
    probeAccentLights: 2,
    probeThrusterSegments: 4,
    strataLaminationBands: 3,
    strataGuideIntensity: 0.86,
    spaceFogDensity: 0.82,
  }),
  low: Object.freeze({
    starfieldCount: 820,
    starfieldStrata: 3,
    starfieldPeakAlpha: 0.72,
    granulationOctaves: 2,
    starSpotCount: 3,
    starProminenceCount: 2,
    coronaStreamerCount: 4,
    diffractionSpikeCount: 4,
    planetCloudOctaves: 2,
    planetNightDensity: 0.6,
    atmosphereScatteringLevel: 1,
    probeAccentLights: 1,
    probeThrusterSegments: 3,
    strataLaminationBands: 2,
    strataGuideIntensity: 0.7,
    spaceFogDensity: 0.62,
  }),
} satisfies Record<Quality, BabylonUpliftTier>)

export function babylonUpliftTier(quality: Quality): BabylonUpliftTier {
  return TIERS[quality]
}

/**
 * 逐类别的「这一档还有没有它」。
 *
 * 返回布尔而不是数值，是因为不变量要断言的是**存在**，不是强度 ——
 * 强度的单调性由另一条用例盯着。
 */
export function upliftCategoryPresence(
  tier: BabylonUpliftTier,
): Readonly<Record<UpliftEffectCategory, boolean>> {
  return Object.freeze({
    starfield: tier.starfieldCount > 0 && tier.starfieldStrata === 3,
    starSpots: tier.starSpotCount > 0,
    starGranulation: tier.granulationOctaves > 0,
    starProminences: tier.starProminenceCount > 0,
    coronaStreamers: tier.coronaStreamerCount > 0,
    starDiffraction: tier.diffractionSpikeCount > 0,
    planetClouds: tier.planetCloudOctaves > 0,
    planetNightSide: tier.planetNightDensity > 0,
    planetAtmosphere: tier.atmosphereScatteringLevel > 0,
    probeAccentLights: tier.probeAccentLights > 0,
    probeThruster: tier.probeThrusterSegments > 0,
    strataLaminations: tier.strataLaminationBands > 0,
    strataGuideLight: tier.strataGuideIntensity > 0,
    spaceFog: tier.spaceFogDensity > 0,
  })
}
