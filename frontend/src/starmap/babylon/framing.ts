// 相机取景，与 Three 的 Renderer 同规则。
//
// 迁移之后取景全部改成了「按包围盒推」：全景距离取星群包围盒 × 2.4，
// 行星聚焦距离取行星半径 × 4。两者都丢掉了旧版的产品意图 ——
//
//   * 全景距离必须由 sceneRadius 导出（从原点量、下限 60），否则单星宇宙里
//     相机会停在十几个单位处，星云与核心盘糊满整屏；
//   * 行星聚焦距离必须由**轨道半径**导出：相机与恒星到行星的距离同量级，
//     于是行星在近景、恒星在它背后当光源，两者都在画面里。用行星半径推，
//     恒星就退化成占满背景的一堵墙。
//
// 视场也一并对齐：Three 用 60°（比 three 默认的 75° 稳，边缘点精灵不变形），
// Babylon 默认 0.8 rad ≈ 45.8°。视场不同，同一个距离占屏比例就不同，
// 于是所有距离常量都不可迁移。把视场对齐之后，下面这些数就能逐字照搬。

/** Three PerspectiveCamera 的垂直视场（弧度）。 */
export const THREE_VERTICAL_FOV = (60 * Math.PI) / 180

/** Three: `targetDist = R * 1.62`。 */
export const PANORAMA_DISTANCE_SCALE = 1.62
/** Three: 创世起始 `dist = R * 4.6`，同时也是滚轮的最远上限。 */
export const PANORAMA_ENTRY_SCALE = 4.6
/** Three: 全景滚轮下限 `R * 0.62`。 */
export const PANORAMA_NEAR_SCALE = 0.62

/** Three SYSTEM_NEAR：待在恒星系里时的滚轮下限。 */
export const SYSTEM_NEAR = 4.5
/** Three PLANET_NEAR：跟随行星时的滚轮下限，也是阅读工作台打开时的距离。 */
export const PLANET_NEAR = 1.2

/**
 * 恒星系外缘占垂直半视场的比例。
 *
 * 由 Three 的两个数反推：外缘 8 个世界单位、距离 16、视场 60° ——
 * `atan(8 / 16) / 30° = 0.88`。把它当成不变量，换个视场也能算出同样的构图。
 */
export const SYSTEM_FRAME_FILL = Math.atan(8 / 16) / (THREE_VERTICAL_FOV / 2)

/**
 * Three SYSTEM_DIST：恒星系取景的下限。
 *
 * 旧版把它写死成 16，因为那套轨道阶梯的外缘总在 8 个单位上下。行星少的
 * 恒星系不该因为「实测外缘更小」就被推近一倍 —— 那会让恒星占满画面。
 */
export const SYSTEM_DISTANCE_FLOOR = 16

/** Three: 滚轮外拉时逐级脱离的阈值。 */
export const PLANET_EXIT_SCALE = 0.85
export const SYSTEM_EXIT_SCALE = 0.9

export type FramingPhase = 'panorama' | 'star-focus' | 'planet-focus'

type Point = Readonly<{ p: readonly [number, number, number] }>
type Centre = Readonly<{ c: readonly [number, number, number] }>

function magnitude(point: readonly [number, number, number]): number {
  const length = Math.hypot(point[0], point[1], point[2])
  return Number.isFinite(length) ? length : 0
}

/**
 * 场景包围半径，与 gl/scene.ts::sceneRadius 同式：**从原点量**，下限 60。
 *
 * 布局本身是以原点为中心的，用质心包围盒会把单星宇宙压缩成一个点。
 */
export function sceneRadiusOf(stars: readonly Point[], clusters: readonly Centre[]): number {
  let maximum = 0
  for (const star of stars) maximum = Math.max(maximum, magnitude(star.p))
  for (const cluster of clusters) maximum = Math.max(maximum, magnitude(cluster.c))
  return Math.max(60, maximum)
}

export function panoramaDistance(sceneRadius: number): number {
  const radius = Number.isFinite(sceneRadius) && sceneRadius > 0 ? sceneRadius : 60
  return radius * PANORAMA_DISTANCE_SCALE
}

/**
 * 恒星系取景距离。
 *
 * @param extent 系统外缘半径（最外层轨道 + 行星半径）。
 * @param verticalFov 相机垂直视场（弧度）。
 */
export function systemDistance(extent: number, verticalFov: number): number {
  const outer = Number.isFinite(extent) && extent > 0 ? extent : 0
  const fov = Number.isFinite(verticalFov) && verticalFov > 0 && verticalFov < Math.PI
    ? verticalFov
    : THREE_VERTICAL_FOV
  const distance = outer / Math.tan((fov / 2) * SYSTEM_FRAME_FILL)
  const framed = Number.isFinite(distance) ? distance : SYSTEM_NEAR
  return Math.max(SYSTEM_NEAR, SYSTEM_DISTANCE_FLOOR, framed)
}

/**
 * 跟随一颗行星时的相机距离，与 Renderer.ts::planetDist 同式。
 *
 * 取轨道半径的 0.8 倍：相机与恒星到行星的距离同量级，于是行星在近景、
 * 恒星在它背后当光源。夹在 2.8–6.0，内圈行星不至于被恒星糊满屏，
 * 外圈行星也不至于小成一个点。
 */
export function planetFocusDistance(orbitRadius: number): number {
  const radius = Number.isFinite(orbitRadius) && orbitRadius > 0 ? orbitRadius : 0
  return Math.min(6, Math.max(2.8, radius * 0.8))
}

export interface FramingScale {
  readonly sceneRadius: number
  readonly systemDistance?: number
}

/** 三层滚轮下限：跟着行星 / 待在恒星系里 / 全景。 */
export function wheelRadiusBounds(
  phase: FramingPhase,
  scale: FramingScale,
): Readonly<{ low: number; high: number }> {
  const radius = Number.isFinite(scale.sceneRadius) && scale.sceneRadius > 0 ? scale.sceneRadius : 60
  const low = phase === 'planet-focus' ? PLANET_NEAR
    : phase === 'star-focus' ? SYSTEM_NEAR
      : radius * PANORAMA_NEAR_SCALE
  return Object.freeze({ low, high: radius * PANORAMA_ENTRY_SCALE })
}

/**
 * 一路拉远就逐级脱离，不用专门去点「返回」：行星 → 恒星系 → 全景。
 *
 * @returns 超过这个半径就退一级；全景已经是最外层，返回 null。
 */
export function wheelExitThreshold(phase: FramingPhase, scale: FramingScale): number | null {
  if (phase === 'planet-focus') {
    const system = Number.isFinite(scale.systemDistance) && (scale.systemDistance as number) > 0
      ? scale.systemDistance as number
      : systemDistance(8, THREE_VERTICAL_FOV)
    return system * PLANET_EXIT_SCALE
  }
  if (phase === 'star-focus') {
    const radius = Number.isFinite(scale.sceneRadius) && scale.sceneRadius > 0 ? scale.sceneRadius : 60
    return radius * SYSTEM_EXIT_SCALE
  }
  return null
}

/** Three 的开场机位：`yaw = 0.5`、`pitch = -0.2`（见 Renderer 的初始值）。 */
export const THREE_PANORAMA_YAW = 0.5
export const THREE_PANORAMA_PITCH = -0.2

/**
 * 把 Three 的 yaw/pitch 换成 ArcRotateCamera 的 alpha/beta。
 *
 * Three:   position = focus  + (sin y·cos p, -sin p, cos y·cos p) · dist
 * Babylon: position = target + (cos a·sin b,  cos b, sin a·sin b) · radius
 *
 * 两套约定不同轴序，直接照抄数字会得到一个完全不同的机位 —— 而机位决定
 * 主体落在画面的哪里，也就决定了质心指标。
 */
export function arcRotateFromYawPitch(
  yaw: number,
  pitch: number,
): Readonly<{ alpha: number; beta: number }> {
  const safeYaw = Number.isFinite(yaw) ? yaw : THREE_PANORAMA_YAW
  const safePitch = Number.isFinite(pitch) ? pitch : THREE_PANORAMA_PITCH
  const x = Math.sin(safeYaw) * Math.cos(safePitch)
  const y = -Math.sin(safePitch)
  const z = Math.cos(safeYaw) * Math.cos(safePitch)
  const beta = Math.acos(Math.min(1, Math.max(-1, y)))
  return Object.freeze({ alpha: Math.atan2(z, x), beta })
}
