import type { Quality } from '../quality'

// Babylon 的画质分档，对齐 gl/cinematic.ts。
//
// 迁移到 Babylon 的过程中这一层整个丢了：bloom 阈值被定在 1.05（比恒星
// 着色器能发出的任何值都高，于是永远不触发）、权重固定 0.14 不分档、
// 全景直接关闭 bloom，抗锯齿全关，backing store 无条件砍到 1.25。
// 这里把它按 Three 的参数还原回来，并且只还原，不新增效果。

export type BabylonScenePhase = 'panorama' | 'star-focus' | 'planet-focus' | 'strata'

export interface BabylonCinematicEnvironment {
  /**
   * 亮度阈值，取自 Three BloomEffect 的 `luminanceThreshold`。
   * 必须低于恒星表面/核心的实际辐亮度，否则 bloom 抓不到任何东西。
   */
  readonly bloomThreshold: number
  /** Three BloomEffect 的 `intensity`，逐档取值。 */
  readonly bloomWeight: number
  /** bloom 渲染目标的降采样比例，越小越省。 */
  readonly bloomScale: number
  /** 高斯核基准宽度，近似 Three 的 mipmap levels + radius。 */
  readonly bloomKernel: number
  /** MSAA 采样数；Three 只在 high 档开 4x。 */
  readonly multisampling: number
  /** MSAA 之外的兜底抗锯齿，给采样数不足的档位。 */
  readonly fxaa: boolean
  /** 桌面 backing store 上限；Three 全档位都是 2.0。 */
  readonly maxDevicePixelRatio: number
  /** 移动端上限，同一档位下必然不高于桌面。 */
  readonly mobileDevicePixelRatio: number
  /**
   * 星云立方体贴图的烘焙边长；只降分辨率，不删图层。
   *
   * 三层壳 × 六个面的域扭曲 fbm 全部落在最初几帧上。512 时那是 470 万像素、
   * 每像素三十来次 simplex —— 软件光栅器会卡住好几秒，而相机飞行是按墙钟
   * 推进的，于是飞行被饿死。星云是一层低频背景，256 与 512 肉眼无差。
   */
  readonly nebulaBake: number
  /** 三层壳的增益，取自 Three 的 shellGain。 */
  readonly shellGain: readonly [number, number, number]
  /** 星系核心增益。 */
  readonly coreGain: number
  /** 尘埃密度系数；低档抽稀，但永不为 0。 */
  readonly dustDensity: number
}

/**
 * 每档位的采样预算（dpr² × 采样数）都不超过 Three 同档位的开销，
 * 所以"恢复画质"不是拿性能换来的：medium/low 用更低的 backing store
 * 换来 FXAA，总采样数反而比旧版少。
 */
const ENVIRONMENTS: Readonly<Record<Quality, BabylonCinematicEnvironment>> = Object.freeze({
  high: Object.freeze({
    bloomThreshold: 0.68,
    bloomWeight: 0.72,
    bloomScale: 0.5,
    bloomKernel: 64,
    multisampling: 4,
    fxaa: false,
    maxDevicePixelRatio: 2,
    mobileDevicePixelRatio: 1.5,
    nebulaBake: 256,
    shellGain: Object.freeze([0.10, 0.075, 0.035] as const),
    coreGain: 0.38,
    dustDensity: 1,
  }),
  medium: Object.freeze({
    bloomThreshold: 0.68,
    bloomWeight: 0.62,
    bloomScale: 0.5,
    bloomKernel: 48,
    multisampling: 1,
    fxaa: true,
    maxDevicePixelRatio: 1.75,
    mobileDevicePixelRatio: 1.25,
    nebulaBake: 192,
    shellGain: Object.freeze([0.085, 0.055, 0.025] as const),
    coreGain: 0.30,
    dustDensity: 0.75,
  }),
  low: Object.freeze({
    bloomThreshold: 0.68,
    bloomWeight: 0.48,
    bloomScale: 0.4,
    bloomKernel: 32,
    multisampling: 1,
    fxaa: true,
    maxDevicePixelRatio: 1.5,
    mobileDevicePixelRatio: 1,
    nebulaBake: 128,
    shellGain: Object.freeze([0.06, 0.035, 0.015] as const),
    coreGain: 0.22,
    dustDensity: 0.5,
  }),
})

/** 全景的核宽度减半：那里的主体是点精灵，不需要恒星系那么厚的光晕。 */
const PHASE_KERNEL_SCALE: Readonly<Record<BabylonScenePhase, number>> = Object.freeze({
  panorama: 0.5,
  'star-focus': 1,
  'planet-focus': 1,
  strata: 0.75,
})

export function babylonCinematicEnvironment(quality: Quality): BabylonCinematicEnvironment {
  return ENVIRONMENTS[quality]
}

/**
 * Bloom 在任何阶段都不关闭。
 *
 * 旧实现在全景直接 `enabled: false`，于是那一屏里最该发光的东西 —— 恒星 ——
 * 反而是唯一不发光的。省下来的填充率用更窄的核换，而不是整段关掉。
 */
export function babylonBloomPolicy(
  phase: BabylonScenePhase,
  quality: Quality,
): Readonly<{ enabled: boolean; kernel: number }> {
  const environment = ENVIRONMENTS[quality]
  return Object.freeze({
    enabled: true,
    kernel: Math.round(environment.bloomKernel * PHASE_KERNEL_SCALE[phase]),
  })
}

/** Backing store 倍率：按档位取上限，绝不放大低密度屏。 */
export function cappedDevicePixelRatio(
  devicePixelRatio: number,
  mobile: boolean,
  quality: Quality,
): number {
  const environment = ENVIRONMENTS[quality]
  const ceiling = mobile ? environment.mobileDevicePixelRatio : environment.maxDevicePixelRatio
  const finiteRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  return Math.min(ceiling, Math.max(1, finiteRatio))
}
