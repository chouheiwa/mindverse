import type { PlanetSurfaceDescriptor } from './planetSurface'

// 行星近景的外观规则。
//
// 提升批次要求近景「不能光秃」，但**新增的每一条外观都必须还是证据**，
// 不能是为了好看随手加的装饰。这个模块把「画面上多出来的东西」逐条接回
// 已有的数据轴，接不上的一律不加：
//
// | 画面上的东西 | 数据轴 | 语义 |
// |---|---|---|
// | 云量 | freshness（热度） | 还在被讨论的问题有活跃的大气 |
// | 云速 | incident（恒星距离） | 离恒星越近，环流越快 |
// | 夜侧灯火 | answerCount（回答数） | 一条回答就是一盏灯 |
// | 雪线 | incident（恒星距离） | 远了就从两极冻到赤道 |
// | 熔岩裂谷 | magma × faultStrength（年代跨度） | 热 + 有历史才裂得开 |
// | 冰裂 | ice 权重 | 冻透了才裂 |
//
// 于是「近景更丰富」与「近景仍然在说这条数据」是同一件事。

export interface PlanetAppearance {
  /** 云覆盖度 0–1。 */
  readonly cloudCoverage: number
  /** 云层相对自转的角速度系数。 */
  readonly cloudSpeed: number
  /** 夜侧灯火密度 0–1。 */
  readonly nightLightDensity: number
  /** 雪线：纬度阈值，1 = 只有极点，0 = 冻到赤道。 */
  readonly snowLine: number
  /** 熔岩裂谷的自发光强度。 */
  readonly lavaGlow: number
  /** 冰裂纹强度。 */
  readonly iceFracture: number
  /** 陨石坑在着色上的可见度（几何已有，这条控制明暗对比）。 */
  readonly craterVisibility: number
}

const clamp01 = (value: number): number => {
  const finite = Number.isFinite(value) ? value : 0
  return Math.min(1, Math.max(0, finite))
}

/** 一条回答也是一盏灯：夜侧的下限。 */
const NIGHT_LIGHT_FLOOR = 0.08
/** 云的下限：即使被烤干或冻透，也保留一层薄云而不是删掉这个类别。 */
const CLOUD_FLOOR = 0.06
/** 冻透的世界，冰盖至少要越过中纬度：雪线的上限。 */
const ICE_SNOW_CEILING = 0.42

export function describePlanetAppearance(surface: PlanetSurfaceDescriptor): PlanetAppearance {
  const { thermal } = surface
  const incident = Number.isFinite(surface.incident) ? Math.max(0, surface.incident) : 0
  const detail = clamp01(surface.detailDensity)
  const fault = clamp01(surface.faultStrength)
  const atmosphere = clamp01(surface.atmosphere)

  // 烤干与冻透都会让大气变薄，但方向不同，所以是两个独立的衰减而不是一条曲线。
  const scorched = clamp01(thermal.magma) * 0.78
  const frozen = clamp01(thermal.ice) * 0.46
  const cloudCoverage = Math.max(
    CLOUD_FLOOR,
    clamp01(atmosphere * (1 - scorched) * (1 - frozen)),
  )

  // 环流速度按入射能量的四次方根：辐射平衡温度 ∝ incident^(1/4)，
  // 而风速大致跟着温度梯度走。用同一条指数，免得再发明一个常数。
  const cloudSpeed = 0.25 + Math.pow(Math.min(incident, 8), 0.25) * 0.55

  // 夜侧灯火跟着回答密度（detailDensity 就是 log 归一化的回答数）。
  const nightLightDensity = Math.max(NIGHT_LIGHT_FLOOR, clamp01(detail * 0.94))

  // 雪线：入射能量高则只有极冠，低则冻到赤道。
  const incidentSnowLine = clamp01(1 - Math.exp(-Math.min(incident, 6) * 1.15))
  // 冰权重只允许把雪线**往赤道压**（阈值更低 = 冰盖更大），绝不允许抬高它。
  //
  // 这一条以前写在着色器里，是 `mix(snowBand, 0.42, uThermalIce)` —— 方向反了：
  // 冰行星的 incidentSnowLine 本来就只有 0.067，往 0.42 混等于把冰盖缩回极点，
  // 并且让 `polarMask` 的 smoothstep 两个边反序（GLSL 未定义，实测极冠翻到赤道）。
  // 折进 CPU 侧之后，方向和定义域都由这里一次说清，着色器只剩一条自推的带宽。
  const snowLine = Math.min(incidentSnowLine, 1 - (1 - ICE_SNOW_CEILING) * clamp01(thermal.ice))

  // 熔岩：热 × 有历史。年轻的热世界表面还没裂开，老的冷世界裂了也不发光。
  const lavaGlow = clamp01(thermal.magma) * clamp01(0.18 + fault * 0.82)

  const iceFracture = clamp01(thermal.ice * 0.82 + thermal.tundra * 0.24)

  // 坑的可见度：新鲜的坑边缘锐利，被风化（有大气）的坑糊掉。
  const craterVisibility = clamp01(0.35 + detail * 0.45 - cloudCoverage * 0.22)

  return Object.freeze({
    cloudCoverage,
    cloudSpeed,
    nightLightDensity,
    snowLine,
    lavaGlow,
    iceFracture,
    craterVisibility,
  })
}
