// 显示端色调响应的 CPU 镜像：KHR PBR Neutral + exposure 0.92，
// 与 BabylonRenderer.configurePlanetImageProcessing 同式。
//
// 为什么需要它：提升批次要回答的问题是「观众看得见吗」，而不是
// 「场景里的数值大不大」。KHR Neutral 在 HDR 1.5 以上只剩约 0.05 的
// 显示动态范围 —— 把恒星表面推到 3.0 再加更多细节，观众看到的仍然是
// 同一块白。这个镜像让「看得见」成为可断言的事实。
//
// 参考实现：KHR_materials_pbrNeutral 的 tone mapping 参考代码，
// 与 Babylon 的 TONEMAPPING_KHR_PBR_NEUTRAL 同源。

export type Rgb = readonly [number, number, number]

/** 与 configurePlanetImageProcessing 的 exposure 同值。 */
export const TONE_EXPOSURE = 0.92

const START_COMPRESSION = 0.8 - 0.04
const DESATURATION = 0.15

/** 线性 RGB → 亮度，与门禁里 frameParity 的口径一致。 */
export function displayLuminance(rgb: Rgb): number {
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}

export function toneMapNeutral(scene: Rgb, exposure = TONE_EXPOSURE): Rgb {
  const exposed: [number, number, number] = [
    Math.max(0, scene[0]) * exposure,
    Math.max(0, scene[1]) * exposure,
    Math.max(0, scene[2]) * exposure,
  ]
  const darkest = Math.min(exposed[0], exposed[1], exposed[2])
  const offset = darkest < 0.08 ? darkest - 6.25 * darkest * darkest : 0.04
  const shifted: [number, number, number] = [
    exposed[0] - offset, exposed[1] - offset, exposed[2] - offset,
  ]
  const peak = Math.max(shifted[0], shifted[1], shifted[2])
  if (peak < START_COMPRESSION) return Object.freeze(shifted) as Rgb

  const headroom = 1 - START_COMPRESSION
  const newPeak = 1 - headroom * headroom / (peak + headroom - START_COMPRESSION)
  const scale = newPeak / Math.max(peak, 1e-6)
  const compressed: [number, number, number] = [
    shifted[0] * scale, shifted[1] * scale, shifted[2] * scale,
  ]
  const wash = 1 - 1 / (DESATURATION * (peak - newPeak) + 1)
  return Object.freeze([
    compressed[0] + (newPeak - compressed[0]) * wash,
    compressed[1] + (newPeak - compressed[1]) * wash,
    compressed[2] + (newPeak - compressed[2]) * wash,
  ]) as Rgb
}

/** 观众看到的亮度：场景辐亮度经色调映射之后的显示亮度。 */
export function perceivedLuminance(scene: Rgb): number {
  return displayLuminance(toneMapNeutral(scene))
}

/**
 * 韦伯对比度：|a − b| / max(a, b)。
 *
 * 用它而不是比值，是因为提升要证明的是「两块区域在画面上分得开」，
 * 而不是「数值差几倍」—— 3.0 与 6.0 差两倍，显示出来却只差 0.012。
 */
export function displayContrast(a: Rgb, b: Rgb): number {
  const left = perceivedLuminance(a)
  const right = perceivedLuminance(b)
  return Math.abs(left - right) / Math.max(left, right, 1e-6)
}
