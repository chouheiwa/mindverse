// 交互反馈：相机阻尼、行星的悬停/选中轮廓、过渡缓动。
//
// 提升批次在这一项上要解决两个具体问题：
//
// 1. **相机没有显式阻尼**：用的是 Babylon 的默认 0.9，从来没有人决定过它，
//    也没有跟 Reduced Motion 联动 —— 而「到位之后还在漂」正是降级动效偏好
//    要消除的那一类运动。
// 2. **行星的选中反馈是 0.02 的边缘光**：写了，但在 bloom 与色调映射之后
//    等于没写。悬停与选中在画面上分不开，用户点下去看不到「我点中了」。

export interface CameraDamping {
  /** ArcRotateCamera.inertia：越大越滑。 */
  readonly inertia: number
  /** 平移惯性，恒不高于旋转惯性 —— 平移漂移比旋转漂移更容易让人晕。 */
  readonly panningInertia: number
  readonly angularSensibility: number
  /**
   * 滚轮步长。
   *
   * 恒为 0.012：批次 4 的退出阶梯（planet → star → panorama）三个阈值是按
   * 这个步长标定的。阻尼可以改惯性，改步长会连带改掉退出层级的手感。
   */
  readonly wheelDeltaPercentage: number
}

const WHEEL_DELTA_PERCENTAGE = 0.012

export function cameraDamping(reducedMotion: boolean): CameraDamping {
  return reducedMotion
    ? Object.freeze({
      // 不是 0：完全没有惯性会让每一次拖拽变成硬切，那同样是突兀的运动。
      // 0.55 让镜头在两三帧内停稳，既不漂也不跳。
      inertia: 0.55,
      panningInertia: 0.42,
      angularSensibility: 1400,
      wheelDeltaPercentage: WHEEL_DELTA_PERCENTAGE,
    })
    : Object.freeze({
      inertia: 0.88,
      panningInertia: 0.80,
      angularSensibility: 1100,
      wheelDeltaPercentage: WHEEL_DELTA_PERCENTAGE,
    })
}

export interface PlanetInteractionRim {
  readonly intensity: number
  readonly color: readonly [number, number, number]
}

/** 悬停是暖的（「这里可以点」），选中是冷的（「这里已经是你的焦点」）。 */
const HOVER_COLOR = Object.freeze([1, 0.78, 0.42] as const)
const SELECTED_COLOR = Object.freeze([0.34, 0.78, 1.15] as const)

export function planetInteractionRim(hover: number, selected: number): PlanetInteractionRim {
  const hovered = clamp01(hover)
  const chosen = clamp01(selected)
  const intensity = Math.min(0.42, hovered * 0.14 + chosen * 0.26)
  if (intensity <= 0) return Object.freeze({ intensity: 0, color: HOVER_COLOR })
  // 两种状态同时成立时颜色按强度加权 —— 选中压过悬停，因为它是更强的状态。
  const weight = chosen * 0.26 / Math.max(intensity, 1e-6)
  return Object.freeze({
    intensity,
    color: Object.freeze([
      HOVER_COLOR[0] + (SELECTED_COLOR[0] - HOVER_COLOR[0]) * weight,
      HOVER_COLOR[1] + (SELECTED_COLOR[1] - HOVER_COLOR[1]) * weight,
      HOVER_COLOR[2] + (SELECTED_COLOR[2] - HOVER_COLOR[2]) * weight,
    ]) as readonly [number, number, number],
  })
}

/**
 * 过渡缓动：五次 smootherstep。
 *
 * 比三次 smoothstep 多一阶连续：起止两端的**加速度**也是 0，所以一次转场
 * 读起来是「镜头动了」而不是「画面切了」。
 */
export function transitionEase(progress: number): number {
  const t = clamp01(progress)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function clamp01(value: number): number {
  const finite = Number.isFinite(value) ? value : 0
  return Math.min(1, Math.max(0, finite))
}
