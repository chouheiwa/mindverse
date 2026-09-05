import type { BabylonUpliftTier } from './visualUplift'

// 探测器的电影化布光与反馈。
//
// 恢复批次已经给了探测器两盏灯（半球补光 + 平行主光），那是「看得见」的
// 底线。提升批次要的是「看得好」：
//
// - **三点布光**：暖主光 + 冷补光 + 背后的轮廓光。单一白光下的金属永远是
//   一块灰 —— 金属感来自两个不同色温的高光在同一个曲面上分开。
// - **推进器**：一艘航行器不能是静物。尾焰有怠速底光、有随油门增长的长度、
//   有不规则的抖动（真实的等离子体推进是不稳定的）。
// - **扫描反馈**：扫描是一次沿机体的扫掠，不是整机同时变亮 ——
//   后者说不出「正在从头扫到尾」。

export type ProbeAccentRole = 'key' | 'fill' | 'rim'

export interface ProbeAccentLight {
  readonly role: ProbeAccentRole
  readonly position: readonly [number, number, number]
  readonly color: readonly [number, number, number]
  readonly intensity: number
  readonly range: number
}

/**
 * 三点布光，按重要性排序。
 *
 * 掉档时从尾巴砍：先掉轮廓光，再掉补光，主光永远在 —— 没有主光的机体
 * 是一块黑剪影，那不是「低画质」，那是「没画」。
 */
const ACCENT_RIG: readonly ProbeAccentLight[] = Object.freeze([
  Object.freeze({
    role: 'key' as const,
    position: Object.freeze([0.42, 0.34, 0.46] as const),
    color: Object.freeze([1, 0.82, 0.58] as const),
    intensity: 1.35,
    range: 3.2,
  }),
  Object.freeze({
    role: 'fill' as const,
    position: Object.freeze([-0.46, -0.12, 0.28] as const),
    color: Object.freeze([0.46, 0.68, 1] as const),
    intensity: 0.72,
    range: 3.0,
  }),
  Object.freeze({
    role: 'rim' as const,
    position: Object.freeze([-0.08, 0.30, -0.58] as const),
    color: Object.freeze([0.72, 0.88, 1] as const),
    intensity: 0.95,
    range: 2.6,
  }),
])

export function probeAccentLights(tier: BabylonUpliftTier): readonly ProbeAccentLight[] {
  const budget = Math.max(1, Math.min(ACCENT_RIG.length, Math.round(tier.probeAccentLights)))
  return Object.freeze(ACCENT_RIG.slice(0, budget))
}

export interface ProbeThrusterInput {
  readonly elapsedMs: number
  /** 0 = 怠速，1 = 全推力。 */
  readonly throttle: number
  readonly reducedMotion: boolean
}

export interface ProbeThrusterPlume {
  readonly length: number
  readonly intensity: number
  readonly coreColor: readonly [number, number, number]
  readonly edgeColor: readonly [number, number, number]
}

/** 怠速也要有底光：熄火的飞船读起来是残骸。 */
const THRUSTER_IDLE = 0.28

export function probeThrusterPlume(input: ProbeThrusterInput): ProbeThrusterPlume {
  const throttle = clamp01(input.throttle)
  const time = input.reducedMotion || !Number.isFinite(input.elapsedMs)
    ? 0
    : Math.max(0, input.elapsedMs)
  // 两个互质周期叠出来的抖动：单一正弦读起来是节拍器，不是等离子体。
  const flicker = input.reducedMotion
    ? 1
    : 1 + 0.16 * Math.sin(time * 0.021) + 0.09 * Math.sin(time * 0.0537 + 1.7)
  const drive = THRUSTER_IDLE + throttle * 0.92
  return Object.freeze({
    length: 0.10 + throttle * 0.46,
    intensity: drive * flicker,
    coreColor: Object.freeze([1, 0.86, 0.62] as const),
    edgeColor: Object.freeze([0.32, 0.56, 1] as const),
  })
}

/** 扫掠沿机体轴向走完的半跨度（本地单位）。 */
export const PROBE_SCAN_SWEEP_SPAN = 0.55

export interface ProbeScanSweep {
  readonly position: number
  readonly opacity: number
}

/**
 * 扫描扫掠。
 *
 * @param progress 0–1 的扫描进度；窗口之外一律不透明度 0。
 */
export function probeScanSweep(progress: number): ProbeScanSweep {
  if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
    return Object.freeze({ position: -PROBE_SCAN_SWEEP_SPAN, opacity: 0 })
  }
  return Object.freeze({
    position: (progress * 2 - 1) * PROBE_SCAN_SWEEP_SPAN,
    // 正弦包络：两端软进软出，中段最亮。硬切会读成一次闪烁故障。
    opacity: Math.sin(progress * Math.PI) * 0.85,
  })
}

function clamp01(value: number): number {
  const finite = Number.isFinite(value) ? value : 0
  return Math.min(1, Math.max(0, finite))
}
