// 答案地层的配色与自发光。
//
// 迁移过来的洞窟把每一层都涂成同一个暗度（emissive = base × 0.36），于是在
// 洞里往任何方向看都是一整块 0.055 亮度的褐色 —— 实拍分带亮度剖面从上到下
// 是 0.0529…0.0616，落差 0.0087。功能测试全绿，但「纵向年代层」这件事在画面
// 上根本不存在。
//
// 地层之所以是地层，靠的是**相邻层的明暗对比**加上**层界那道亮线**。这里把
// 这两件事变成可断言的数：交替明暗的层色，以及比层面亮一个数量级的层界。

export type Rgb = readonly [number, number, number]

/** 沉积岩的四种基色，与旧版洞窟同一套色相。 */
const LAYER_BASE: readonly Rgb[] = Object.freeze([
  Object.freeze([0.40, 0.26, 0.17] as const),
  Object.freeze([0.20, 0.28, 0.32] as const),
  Object.freeze([0.44, 0.35, 0.21] as const),
  Object.freeze([0.17, 0.22, 0.31] as const),
])

/** 相邻层交替明暗；比值定得住「一眼看出这是两层」。 */
const EMISSIVE_BRIGHT = 0.62
const EMISSIVE_DIM = 0.30

/** 层界：比层面亮得多，它才是年代刻度本身。 */
export const SEAM_EMISSIVE: Rgb = Object.freeze([0.14, 0.62, 0.72] as const)
/** 层界厚度（世界单位）。0.10 在 4.8 半径的竖井里只有不到两个像素。 */
export const SEAM_THICKNESS = 0.26

function luminance(color: Rgb): number {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722
}

export function layerBaseColor(colorIndex: number): Rgb {
  const index = Number.isFinite(colorIndex) ? Math.abs(Math.floor(colorIndex)) : 0
  return LAYER_BASE[index % LAYER_BASE.length]!
}

/** 第 `colorIndex` 层的自发光。奇偶交替，于是任何两个相邻层都分得开。 */
export function layerEmissive(colorIndex: number): Rgb {
  const base = layerBaseColor(colorIndex)
  const index = Number.isFinite(colorIndex) ? Math.abs(Math.floor(colorIndex)) : 0
  const gain = index % 2 === 0 ? EMISSIVE_BRIGHT : EMISSIVE_DIM
  return Object.freeze([base[0] * gain, base[1] * gain, base[2] * gain] as const)
}

/** 相邻两层的自发光亮度比。洞里读不读得出「层」，就是这个数。 */
export function adjacentLayerContrast(colorIndex: number): number {
  const here = luminance(layerEmissive(colorIndex))
  const next = luminance(layerEmissive(colorIndex + 1))
  const low = Math.min(here, next)
  return low <= 1e-6 ? Number.POSITIVE_INFINITY : Math.max(here, next) / low
}

/** 洞窟点光：够亮到能看清岩壁纹理，但不至于把层界的亮线压掉。 */
export const CAVE_LIGHT_INTENSITY = 1.5
export const CAVE_LIGHT_RANGE = 16

/** 一条纹理内的纹层高度（世界单位）。竖井半径 4.8，太密就糊成一片。 */
export const LAMINATION_HEIGHT = 1.05
/** 采样剖面的分辨率。 */
export const LAMINATION_TEXTURE_HEIGHT = 256
/** 顶点色能表达的最少/最多纹层环数。 */
const MIN_SUBDIVISIONS = 8
const MAX_SUBDIVISIONS = 96

/**
 * 沉积纹层的灰度剖面。
 *
 * 层界那道亮线标出年代，但只有它的话，两道线之间仍是一整块平色 ——
 * 而层的厚度按跨度算出来是 4–18 个世界单位，竖井半径只有 4.8，
 * 一屏里根本装不下两层。真正让画面读出「地层」的，是层**内部**的纹层。
 *
 * @returns 长度为 `height` 的 0–1 灰度，自上而下。
 */
export function laminationProfile(height = LAMINATION_TEXTURE_HEIGHT): Float32Array {
  const rows = Math.max(2, Math.floor(height))
  const profile = new Float32Array(rows)
  for (let row = 0; row < rows; row += 1) {
    const t = row / rows
    // 三个不同周期叠加：规则的层理 + 两道更粗的沉积事件，避免看起来像条形码。
    const fine = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 8)
    const coarse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * 3 + 1.1)
    const drift = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 + 2.4)
    profile[row] = Math.min(1, Math.max(0, 0.42 + 0.30 * fine + 0.20 * coarse + 0.08 * drift))
  }
  return profile
}

/** 一层岩壁要切成多少环，才够画出它内部的纹层。 */
export function laminationSubdivisions(thickness: number): number {
  const height = Number.isFinite(thickness) && thickness > 0 ? thickness : LAMINATION_HEIGHT
  // 一条纹层至少两环（一明一暗）才不会被顶点插值抹平。
  const wanted = Math.round((height / LAMINATION_HEIGHT) * 3)
  return Math.min(MAX_SUBDIVISIONS, Math.max(MIN_SUBDIVISIONS, wanted))
}

/**
 * 采样纹层灰度：`t` 是自层顶向下的归一化位置。
 */
export function laminationAt(t: number): number {
  const profile = laminationProfile()
  const safe = Number.isFinite(t) ? ((t % 1) + 1) % 1 : 0
  return profile[Math.min(profile.length - 1, Math.floor(safe * profile.length))] as number
}
