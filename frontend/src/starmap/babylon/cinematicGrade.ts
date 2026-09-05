import type { Quality } from '../quality'
import { babylonCinematicEnvironment } from './cinematic'
import { babylonUpliftTier, type BabylonUpliftTier } from './visualUplift'

// 镜头层次：暗角、颜色分级、颗粒、色差与空间雾。
//
// 这一层不改任何物体，只改「这一帧是被什么镜头拍下来的」。它是「电影感」
// 里最便宜也最容易做过头的一部分，所以有两条硬性约束，写在
// cinematicGrade.test.ts 里：
//
// 1. **不碰恢复批次的两个数**：exposure 恒 0.92、bloomThreshold 恒等于
//    cinematic.ts 给的那一档。分级是叠在恢复成果之上的，不是替换它。
// 2. **克制**：暗角权重 ≤ 2.2、颗粒 ≤ 6、色偏 ≤ ±24。越过这几个数之后
//    画面不是更电影，是更脏。
//
// 冷暗部 + 暖亮部是「远近分离」在颜色上的表达 —— 冷退、暖进，是风景画
// 用了几百年的空气透视，在深空里同样成立：远处的星云偏冷，近处的恒星偏暖。

export interface BabylonCinematicGrade {
  /** 暗角权重。Babylon `vignetteWeight`。 */
  readonly vignetteWeight: number
  /** 暗角的色，偏冷的深蓝而不是纯黑 —— 纯黑暗角读起来像镜头脏了。 */
  readonly vignetteColor: readonly [number, number, number]
  /** 胶片颗粒强度。Babylon `grain.intensity`。 */
  readonly grainIntensity: number
  /** 色差强度（像素）。0 表示这一档不开。 */
  readonly chromaticAberration: number
  /** 暗部色偏：负值向冷。Babylon colorCurves 的 shadowsHue/Density 之源。 */
  readonly shadowsCoolness: number
  /** 亮部色偏：正值向暖。 */
  readonly highlightsWarmth: number
  /** 全局饱和度微调。 */
  readonly globalSaturation: number
  /** 与 configurePlanetImageProcessing 同值，这里只是把它写进契约。 */
  readonly exposure: number
  /** 与 cinematic.ts 同值，分级不得改动它。 */
  readonly bloomThreshold: number
}

const VIGNETTE_COLOR = Object.freeze([0.016, 0.024, 0.048] as const)

const GRADES: Readonly<Record<Quality, Omit<BabylonCinematicGrade, 'exposure' | 'bloomThreshold'>>> =
  Object.freeze({
    high: Object.freeze({
      vignetteWeight: 1.65,
      vignetteColor: VIGNETTE_COLOR,
      grainIntensity: 4.2,
      chromaticAberration: 2.4,
      shadowsCoolness: -14,
      highlightsWarmth: 12,
      globalSaturation: 6,
    }),
    medium: Object.freeze({
      vignetteWeight: 1.45,
      vignetteColor: VIGNETTE_COLOR,
      grainIntensity: 3.4,
      chromaticAberration: 1.4,
      shadowsCoolness: -12,
      highlightsWarmth: 10,
      globalSaturation: 5,
    }),
    low: Object.freeze({
      vignetteWeight: 1.2,
      vignetteColor: VIGNETTE_COLOR,
      grainIntensity: 2.6,
      // 色差要一次额外的全屏采样。低档掉的是它，不是整条镜头层 ——
      // 暗角与分级都是逐像素的常数运算，掉了也省不下什么。
      chromaticAberration: 0,
      shadowsCoolness: -10,
      highlightsWarmth: 8,
      globalSaturation: 4,
    }),
  })

export function babylonCinematicGrade(quality: Quality): BabylonCinematicGrade {
  return Object.freeze({
    ...GRADES[quality],
    exposure: 0.92,
    bloomThreshold: babylonCinematicEnvironment(quality).bloomThreshold,
  })
}

export interface SpaceFogWindow {
  readonly near: number
  readonly far: number
}

/**
 * 空间雾窗口。
 *
 * 深空里当然没有雾，但**有**空气透视的等价物：星际尘埃对远处的散射，
 * 以及人眼在没有距离线索时读不出深度这件事。尘埃与轨道环共用一个
 * `depthFade(near, far)`，把 far 按雾密度收进来，远处的东西就真的会淡出，
 * 于是同一屏里「远」和「近」分得开。
 *
 * @param sceneRadius 场景半径。
 * @param cameraDistance 相机到原点的距离。
 */
export function spaceFogWindow(
  sceneRadius: number,
  cameraDistance: number,
  tier: BabylonUpliftTier,
): SpaceFogWindow {
  const radius = Number.isFinite(sceneRadius) && sceneRadius > 0 ? sceneRadius : 1
  const distance = Number.isFinite(cameraDistance) && cameraDistance > 0 ? cameraDistance : radius
  const density = Math.min(1, Math.max(0, tier.spaceFogDensity))
  const near = Math.max(1, distance - radius * 1.15)
  // 密度越高，far 越往回收：high 收到 1.30 倍半径，low 留到 1.75 倍。
  const reach = 1.75 - density * 0.45
  return Object.freeze({ near, far: Math.max(near + 1, distance + radius * reach) })
}

/** 便于调用方一次拿到分档的雾与分级。 */
export function babylonLensFor(quality: Quality): Readonly<{
  grade: BabylonCinematicGrade; tier: BabylonUpliftTier
}> {
  return Object.freeze({ grade: babylonCinematicGrade(quality), tier: babylonUpliftTier(quality) })
}
