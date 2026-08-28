// 恒星色温调色板。
//
// 引擎给出的 (hue, sat) 是语义编码，不是随手挑的颜色：
// 只收藏 → 琥珀 32°，只创作 → 蓝白 218°，中间靠去饱和穿白
// （见 internal/engine/stats.go 的 spectrum，它刻意不在两个色相间插值，
// 因为那会经过绿色，而星空里没有绿星）。
//
// 这里不改动那套编码，只把它放回它本来就属于的物理坐标 —— 恒星色温。
// 于是「颜色 = 数据」依然成立，画面却读起来是星光而不是分类色卡。
//
// 亮度不在这里给。色度由色温决定、亮度由持续性 pe 决定，两者相乘。
// 把亮度混进色度会让暖星永远比蓝星暗，那是错的。

/** 太阳附近，视觉上的白。 */
const T_MID = 6400
/** 一个数量级出头的跨度：3333K（暖橙 K 型）↔ 12288K（蓝白 B 型）。 */
const T_SPAN = 1.92

/**
 * 从 (hue, sat) 还原 spectrum 的输入，映射到 [-1, 1]。
 *
 * -1 = 纯收藏，+1 = 纯创作，0 = 各半。分母取自 spectrum 里的 68 / 62。
 */
export function signedRatio(hue: number, sat: number): number {
  const s = Math.max(0, sat)
  return hue < 125 ? -Math.min(1, s / 68) : Math.min(1, s / 62)
}

/** (hue, sat) → 开尔文色温。 */
export function temperature(hue: number, sat: number): number {
  return T_MID * Math.pow(T_SPAN, signedRatio(hue, sat))
}

/**
 * 黑体色温 → 线性 RGB，归一化到最大分量为 1。
 *
 * 用 Tanner Helland 的分段近似（1000–40000K 内与普朗克曲线足够接近），
 * 输出是 sRGB 编码值，再转到线性空间 —— three 的工作空间是线性的，
 * 直接把 sRGB 数值喂进去会让暖色偏亮、冷色偏灰。
 */
export function blackbodyRGB(kelvin: number): [number, number, number] {
  const t = clamp(kelvin, 1000, 40000) / 100

  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592)
  const g = t <= 66
    ? 99.4708025861 * Math.log(t) - 161.1195681661
    : 288.1221695283 * Math.pow(t - 60, -0.0755148492)
  const b = t >= 66
    ? 255
    : t <= 19
      ? 0
      : 138.5177312231 * Math.log(t - 10) - 305.0447927307

  const lin: [number, number, number] = [
    srgbToLinear(clamp(r, 0, 255) / 255),
    srgbToLinear(clamp(g, 0, 255) / 255),
    srgbToLinear(clamp(b, 0, 255) / 255),
  ]
  const m = Math.max(lin[0], lin[1], lin[2]) || 1
  return [lin[0] / m, lin[1] / m, lin[2] / m]
}

/** (hue, sat) 一步到位取线性 RGB 色度。 */
export function starColor(hue: number, sat: number): [number, number, number] {
  return blackbodyRGB(temperature(hue, sat))
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
