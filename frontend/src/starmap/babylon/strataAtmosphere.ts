import type { BabylonUpliftTier } from './visualUplift'

// 答案地层的纵深与引导。
//
// 恢复批次把「一片黑」修成了「有明暗交替的层」。提升批次要回答下一个问题：
// **往下走的时候，观众怎么知道自己在往下走？**
//
// 三件事回答它：
//
// 1. **深度分级的雾**：越深越暗、越浓。竖井里没有地平线，雾是唯一的距离线索。
// 2. **引导光**：一盏跟着旅行者下移的冷光。它不是照明 —— 照明由层内的点光给；
//    它是「上方还有出口」这件事在画面上的表示。
// 3. **标本光晕**：每一条答案是一个发光的节点，颜色说出「我写的 / 我收的」。
//    没有光晕时标本是一块石头，画面说不出它是一条内容。

export type Rgb = readonly [number, number, number]

/** 引导光的颜色：冷白偏青，与层界的青线同族，与暖色的岩层分得开。 */
export const STRATA_GUIDE_COLOR: Rgb = Object.freeze([0.42, 0.78, 1] as const)

export interface StrataFog {
  readonly color: Rgb
  readonly density: number
}

/** 竖井口的雾色与最深处的雾色。中间线性插值。 */
const FOG_SHALLOW: Rgb = Object.freeze([0.030, 0.052, 0.070] as const)
const FOG_DEEP: Rgb = Object.freeze([0.008, 0.012, 0.020] as const)
const FOG_DENSITY_SHALLOW = 0.022
const FOG_DENSITY_DEEP = 0.046

export function strataDepthFog(depth: number, maxDepth: number): StrataFog {
  const span = Number.isFinite(maxDepth) && maxDepth > 0 ? maxDepth : 1
  const here = Number.isFinite(depth) ? Math.max(0, depth) : 0
  const progress = Math.min(1, here / span)
  return Object.freeze({
    color: Object.freeze([
      FOG_SHALLOW[0] + (FOG_DEEP[0] - FOG_SHALLOW[0]) * progress,
      FOG_SHALLOW[1] + (FOG_DEEP[1] - FOG_SHALLOW[1]) * progress,
      FOG_SHALLOW[2] + (FOG_DEEP[2] - FOG_SHALLOW[2]) * progress,
    ]) as Rgb,
    density: FOG_DENSITY_SHALLOW + (FOG_DENSITY_DEEP - FOG_DENSITY_SHALLOW) * progress,
  })
}

export interface StrataGuideLight {
  readonly y: number
  readonly intensity: number
  readonly range: number
  readonly color: Rgb
}

/** 引导光挂在旅行者上方这么多个世界单位处。 */
const GUIDE_LEAD = 3.4

export function strataGuideLight(depth: number, tier: BabylonUpliftTier): StrataGuideLight {
  const here = Number.isFinite(depth) ? Math.max(0, depth) : 0
  return Object.freeze({
    y: -(here - GUIDE_LEAD),
    intensity: 1.15 * Math.max(0.05, tier.strataGuideIntensity),
    range: 22,
    color: STRATA_GUIDE_COLOR,
  })
}

export interface StrataSpecimenHaloInput {
  readonly scale: number
  readonly created: boolean
  readonly collected: boolean
}

export interface StrataSpecimenHalo {
  readonly radius: number
  readonly intensity: number
  readonly color: Rgb
}

const HALO_CREATED: Rgb = Object.freeze([1, 0.62, 0.24] as const)
const HALO_COLLECTED: Rgb = Object.freeze([0.30, 0.68, 1] as const)
const HALO_NEUTRAL: Rgb = Object.freeze([0.52, 0.70, 0.82] as const)

export function strataSpecimenHalo(input: StrataSpecimenHaloInput): StrataSpecimenHalo {
  const scale = Number.isFinite(input.scale) ? Math.max(0.05, input.scale) : 1
  const color = input.created ? HALO_CREATED : input.collected ? HALO_COLLECTED : HALO_NEUTRAL
  // 写过 > 收过 > 只是读到过。三档强度，与标本本体的配色说同一件事。
  const intensity = input.created ? 0.95 : input.collected ? 0.68 : 0.34
  return Object.freeze({ radius: scale * 2.15, intensity, color })
}
