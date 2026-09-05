import { blackbodyRGB } from '../gl/blackbody'

// 恒星辐亮度的 CPU 镜像，与 shaders/starSurface.fragment.fx 和
// shaders/starCore.fragment.fx 同式（与 planetVisibility.ts 镜像行星可见性
// 门限是同一套做法）。
//
// 存在的理由只有一个：让"恒星是否真的越过 bloom 阈值"变成可断言的事实。
// 迁移后的表面着色器峰值停在 1.0 附近，而阈值被定在 1.05 —— 两者错位，
// 于是恒星在画面上就是一颗有花岗岩纹理的灰球。这类错位靠肉眼看截图发现
// 得太晚，必须由单测直接盯住。

export type Radiance = readonly [number, number, number]

/**
 * 表面 HDR 增益。
 *
 * Three 用 `GAIN.core = 4.6` 把核心顶到 1.0 以上再交给 bloom（见 gl/stars.ts）。
 * 这里取 4.0：圆面中心约 4.5 倍阈值，边缘（limb）仍在阈值之上，
 * 于是整个圆面都有柔光而不是只有一个点亮斑。
 */
export const STAR_SURFACE_HDR_GAIN = 4

/** 输出上限。留出 HDR 余量，同时避免 tone mapping 之后整屏发白。 */
export const STAR_SURFACE_RADIANCE_CEILING = 6

export interface StarSurfaceSample {
  readonly kelvin: number
  readonly color: Radiance
  /** dot(normal, viewDirection)：圆面中心为 1，边缘为 0。 */
  readonly facing: number
  readonly granulation: number
  readonly cellular: number
  readonly activity: number
  /** 星斑覆盖度：0 是宁静光球，1 是本影中心。 */
  readonly spot?: number
  /** 光斑（facula / plage）：只在临边可见，与星斑成对出现。 */
  readonly facula?: number
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

const mix = (from: Radiance, to: Radiance, amount: number): Radiance => [
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
]

/** 线性 RGB → 亮度，与门禁里 frameParity 的口径一致。 */
export function radianceLuminance(radiance: Radiance): number {
  return radiance[0] * 0.2126 + radiance[1] * 0.7152 + radiance[2] * 0.0722
}

/** 与 starSurface.fragment.fx 的 limb 项同式。 */
export function starSurfaceLimb(facing: number): number {
  return 0.3 + 0.7 * Math.pow(Math.max(facing, 0), 0.58)
}

/**
 * 临边色温比。
 *
 * 圆面边缘看到的是光球更高、更冷的一层（同一条视线穿过更少的光学深度），
 * 所以真实恒星的边缘不只是更暗，还更红。恢复批次只有亮度衰减、没有色温分层，
 * 于是整个圆面是同一个色相 —— 那正是「白团」读感的一半来源。
 */
export const STAR_LIMB_TEMPERATURE_RATIO = 0.74
/** 核心视向的色温比：视线最深、最热的一层。 */
export const STAR_CORE_TEMPERATURE_RATIO = 1.16

/**
 * 色球的颜色。
 *
 * 光球之上那一层稀薄的氢在 Hα 上发光，日全食时露出来的就是这一圈红边 ——
 * 它的颜色由跃迁能级决定，与恒星的有效温度无关。所以蓝白星的临边同样偏暖，
 * 只是没那么红。分层色温靠它才在蓝端也成立，而不是只对暖星有效。
 */
export const STAR_CHROMOSPHERE_COLOR: Radiance = Object.freeze([1, 0.34, 0.2]) as Radiance
const CHROMOSPHERE_MIX = 0.5

export function starLimbTemperature(kelvin: number): number {
  return kelvin * STAR_LIMB_TEMPERATURE_RATIO
}

/**
 * 临边的合成色：更冷一层的黑体色，再叠上色球的红边。
 *
 * **保亮度**：色球只改色相，不改能量。不归一化的话临边亮度会掉到
 * 0.64 —— 低于 bloom 阈值，恢复批次「整个圆面都有柔光」那条门禁当场破。
 * 分层色温是一次调色，不该顺手把恢复成果吃掉。
 */
export function starLimbTint(kelvin: number): Radiance {
  const cooler = blackbodyRGB(starLimbTemperature(kelvin)) as unknown as Radiance
  const tinted = mix(cooler, STAR_CHROMOSPHERE_COLOR, CHROMOSPHERE_MIX)
  const gain = radianceLuminance(cooler) / Math.max(radianceLuminance(tinted), 1e-6)
  return Object.freeze([tinted[0] * gain, tinted[1] * gain, tinted[2] * gain]) as Radiance
}

export function starTemperatureLayers(kelvin: number): Readonly<{
  core: number; photosphere: number; limb: number
}> {
  const base = clamp(kelvin, 1000, 50_000)
  return Object.freeze({
    core: base * STAR_CORE_TEMPERATURE_RATIO,
    photosphere: base,
    limb: base * STAR_LIMB_TEMPERATURE_RATIO,
  })
}

/**
 * 本影底：黑子最暗处保留的辐亮度比例。
 *
 * 真实黑子本影约是宁静光球的 20–30% —— 它是一个更冷的洞，不是一块黑漆。
 * 取 0.16 是因为这里还要穿过 bloom：邻域的光会漫进来，显示端的实际落差
 * 比这个数小得多（由 starSurfaceUplift.test.ts 的显示端对比度盯住）。
 */
export const STAR_UMBRA_FLOOR = 0.16

/**
 * 米粒组织的明暗跨度。
 *
 * 恢复批次是 `0.62 + g*0.42 + c*0.12`（跨度 0.62–1.16，1.87 倍）。
 * 提升后是 `0.34 + g*0.86 + c*0.24`（跨度 0.34–1.44，4.24 倍），
 * **均值恒为 0.89 不变** —— 于是恢复门禁的三条断言（中心 > 3 倍阈值、
 * 边缘在阈值之上、单调下降）逐位不受影响，变的只有对比度。
 */
const GRANULATION_FLOOR = 0.34
const GRANULATION_GAIN = 0.86
const CELLULAR_GAIN = 0.24
/** 均值处的 detail。对比曲线绕着它取幂，于是这一点恒等。 */
const GRANULATION_MEAN = 0.89
/**
 * 对比曲线的指数。
 *
 * 只加大跨度不够：跨度加大之后，亮的一半照样落在 KHR Neutral 的压缩段里，
 * 暗的一半却离不开中段。绕均值取幂能把暗侧真正推进线性段 —— 那是显示端
 * 唯一还有动态范围的地方。均值处恒等，所以恢复门禁逐位不变。
 */
const GRANULATION_CONTRAST = 1.85

export function starSurfaceDetail(granulation: number, cellular: number): number {
  const linear = GRANULATION_FLOOR + clamp(granulation, 0, 1) * GRANULATION_GAIN
    + clamp(cellular, 0, 1) * CELLULAR_GAIN
  return GRANULATION_MEAN * Math.pow(Math.max(linear, 0.02) / GRANULATION_MEAN, GRANULATION_CONTRAST)
}

export function starSurfaceRadiance(sample: StarSurfaceSample): Radiance {
  const heat = clamp((sample.kelvin - 2800) / 7000, 0, 1)
  const hotCenter = mix(sample.color, [1, 0.92, 0.76], 0.42 + heat * 0.24)
  const limbColor = starLimbTint(sample.kelvin)
  const facing = clamp(sample.facing, 0, 1)
  // 色温分层：越靠边，色相越倒向更冷那一层的黑体色。
  const stratified = mix(limbColor, hotCenter, Math.pow(facing, 0.42))
  const detail = starSurfaceDetail(sample.granulation, sample.cellular)
  const limb = starSurfaceLimb(sample.facing)
  const spot = clamp(sample.spot ?? 0, 0, 1)
  const spotFactor = 1 - (1 - STAR_UMBRA_FLOOR) * spot
  // 光斑只在临边可见：正对视线时热壁的侧面看不到，是真实的几何效应。
  const facula = clamp(sample.facula ?? 0, 0, 1) * (1 - facing) * 0.62
  const flare = clamp(sample.activity, 0, 1)
    * Math.pow(Math.max(0, clamp(sample.granulation, 0, 1) - 0.62), 3) * 2.4
  const flareColor = mix(sample.color, [1, 0.48, 0.16], 0.5)
  return Object.freeze([0, 1, 2].map((channel) => Math.min(
    STAR_SURFACE_RADIANCE_CEILING,
    (stratified[channel]! * detail * limb * spotFactor * (1 + facula)
      + flareColor[channel]! * flare) * STAR_SURFACE_HDR_GAIN,
  )) as unknown as Radiance)
}

/**
 * 与 starCore.fragment.fx 同式。
 *
 * @param radial 精灵内的归一化半径，0 是中心、1 是外缘。
 */
export function starCoreRadiance(color: Radiance, bright: number, radial: number): Radiance {
  const hot = mix(color, [1, 1, 1], 0.74)
  const squaredRadius = clamp(radial, 0, 1) ** 2
  const energy = Math.min(4.8, (1.4 + Math.max(0, bright) * 2.1) * Math.exp(-squaredRadius * 7.5))
  return Object.freeze([hot[0] * energy, hot[1] * energy, hot[2] * energy] as const)
}

/**
 * 点精灵亮度，与 starVisualDescriptor.luminance 同式。
 *
 * @param bright `starData.bright`，取值 0.3 + 0.7 * 持续性。
 */
export function starPanoramaBrightness(bright: number): number {
  return clamp(0.72 + Math.log1p(Math.max(0, bright) * 4), 0.72, 2.4)
}

/**
 * 衍射星芒的门槛。
 *
 * Three 卡在 `bright >= 0.85`（gl/stars.ts 的 SPIKE_THRESHOLD）：只有持续性
 * 最高的那十来颗会长芒。阈值低一点点画面就变成每颗星都插着十字的廉价滤镜。
 * Babylon 的点精灵用的是对数亮度，所以门槛要经同一条映射换算过来，
 * 而不是随手写一个数。
 */
export const STAR_SPIKE_BRIGHTNESS = 0.85
export const STAR_FLARE_THRESHOLD = starPanoramaBrightness(STAR_SPIKE_BRIGHTNESS)
/** 与 starFlare.fragment.fx 的 gate 同式。 */
export const STAR_FLARE_SMOOTHING = 0.14

export function flareGate(panoramaBrightness: number): number {
  const span = Math.max(1e-6, STAR_FLARE_SMOOTHING)
  const progress = clamp((panoramaBrightness - STAR_FLARE_THRESHOLD) / span, 0, 1)
  return progress * progress * (3 - 2 * progress)
}
