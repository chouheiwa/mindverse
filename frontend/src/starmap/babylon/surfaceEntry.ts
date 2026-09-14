import type { Vec3 } from './cubeSphere'

// 「从宇宙进来」的编排。
//
// 之前的进入是：宇宙瞬间关掉 → 一条直线插值 1100ms → 站住。你从没看见过太空，
// 只看见黑底上长出地形，所以它读起来不像俯冲，像切场景。
//
// 现在是一条真的航线：保持高空绕到落点正上方，再沿半径落下去；途中宇宙背景淡出、
// 行星天空淡入，穿过大气之后宇宙层才整个退场。

/** 方位摆到落点上方所占的行程比例。 */
const ARC_SPAN = 0.7
/** 注视点从行星中心转到地平线的区间。 */
const TARGET_TURN_FROM = 0.55

// 呈现全部由**离地高度**驱动，不由进度驱动。
//
// 按进度算过一版，结果是：进度 0.45 时天空已经半透明地把整屏染成橙色，而相机其实还在
// 94 倍半径之外 —— 星空全被盖住，完全不像在宇宙里；「穿过大气」那一刻相机还在 57 倍
// 半径外。高度才是这件事的物理量。单位是**行星半径的倍数**，站在地面上约等于 1。

/** 宇宙背景开始淡出/淡完的高度。 */
const BACKDROP_FULL_ABOVE = 14
const BACKDROP_GONE_BELOW = 3.5
/** 宇宙层（恒星、同系行星、轨道环）退场的高度：进了大气就没有轨道视角了。 */
export const ATMOSPHERE_TOP = 2.2
/** 天空淡入的高度区间。 */
const SKY_NONE_ABOVE = 2.6
const SKY_FULL_BELOW = 1.25

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

const smooth = (value: number): number => {
  const t = clamp01(value)
  return t * t * (3 - 2 * t)
}

/** 把 value 从 from→to 映射到 0→1，两端夹住并抹平。value 不限于 [0,1]。 */
const ramp = (value: number, from: number, to: number): number =>
  smooth(((Number.isFinite(value) ? value : from) - from) / Math.max(1e-6, to - from))

export interface EntryPresentation {
  /** 宇宙背景（星云、尘埃、星场）的可见度：1 → 0。 */
  readonly backdrop: number
  /** 宇宙层是否还在场。穿过大气之后整个退场。 */
  readonly universeVisible: boolean
  /** 行星天空的可见度：0 → 1。 */
  readonly sky: number
}

/** `altitude` 是相机到星心的距离，以行星半径为单位；站在地面上约等于 1。 */
export function surfaceEntryPresentation(altitude: number): EntryPresentation {
  const height = Number.isFinite(altitude) ? Math.max(0, altitude) : 1
  return Object.freeze({
    backdrop: ramp(height, BACKDROP_GONE_BELOW, BACKDROP_FULL_ABOVE),
    universeVisible: height > ATMOSPHERE_TOP,
    sky: 1 - ramp(height, SKY_FULL_BELOW, SKY_NONE_ABOVE),
  })
}

const length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2])
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
]
const normalize = (v: Vec3, fallback: Vec3 = [0, 1, 0]): Vec3 => {
  const len = length(v)
  return Number.isFinite(len) && len > 1e-9 ? [v[0] / len, v[1] / len, v[2] / len] : fallback
}

/** 单位向量之间的球面插值；反向时选择稳定的切向，避免中点跳到对面。 */
export function slerpDirection(from: Vec3, to: Vec3, t: number): Vec3 {
  const a = normalize(from)
  const b = normalize(to, a)
  const cosine = Math.min(1, Math.max(-1, dot(a, b)))
  if (cosine > 0.9995) return normalize(lerp3(a, b, clamp01(t)), a)
  if (cosine < -0.9995) {
    const reference: Vec3 = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
    const tangent = normalize(sub(b, scale(a, cosine)), normalize(sub(reference, scale(a, dot(reference, a)))))
    const angle = Math.acos(cosine) * clamp01(t)
    return normalize(add(scale(a, Math.cos(angle)), scale(tangent, Math.sin(angle))), a)
  }
  const angle = Math.acos(cosine)
  const sine = Math.sin(angle)
  const k = clamp01(t)
  return normalize(add(scale(a, Math.sin((1 - k) * angle) / sine), scale(b, Math.sin(k * angle) / sine)), a)
}

/** 等比下落：radius(p) = from · (to/from)^p。两端严格对齐。 */
export function surfaceEntryRadius(fromRadius: number, standRadius: number, progress: number): number {
  const from = Number.isFinite(fromRadius) && fromRadius > 0 ? fromRadius : 1
  const to = Number.isFinite(standRadius) && standRadius > 0 ? standRadius : 1
  const p = clamp01(progress)
  const value = from * Math.pow(to / from, p)
  return Number.isFinite(value) ? value : to
}

export interface EntryPoseInput {
  /** 进入时的机位与注视点（世界坐标）。 */
  readonly from: Vec3
  readonly fromTarget: Vec3
  /** 站立机位与它看向的地平线（世界坐标）。 */
  readonly standing: Vec3
  readonly standingTarget: Vec3
  /** 行星中心。 */
  readonly centre: Vec3
  readonly progress: number
}

export interface EntryPose {
  readonly position: Vec3
  readonly target: Vec3
}

/**
 * 俯冲航线上的一点。
 *
 * 方位在前 70% 里从进入方向摆到落点正上方（沿大圆，不是直线穿过行星）；
 * 高度等比下落 —— 每段时间走同样的倍率，全程都像在稳定逼近。
 * progress 为 0 时严格回到进入机位，为 1 时严格落到站立机位。
 */
export function surfaceEntryPose(input: EntryPoseInput): EntryPose {
  const p = clamp01(input.progress)
  const fromRadial = sub(input.from, input.centre)
  const standRadial = sub(input.standing, input.centre)
  const fromRadius = length(fromRadial)
  const standRadius = length(standRadial)
  const direction = slerpDirection(
    normalize(fromRadial, normalize(standRadial)),
    normalize(standRadial),
    smooth(p / ARC_SPAN),
  )
  // 等比下落：每段时间走同样的**倍率**，而不是同样的距离。线性下落在高空几乎看不出
  // 在动，最后又一头栽下去；等比下落从头到尾都像在稳定逼近。
  const radius = surfaceEntryRadius(fromRadius, standRadius, p)
  const safeRadius = Number.isFinite(radius) ? radius : standRadius
  return Object.freeze({
    position: add(input.centre, scale(direction, safeRadius)),
    // 注视点最后才从行星中心转向地平线：一路俯冲时看的是这颗星球。
    target: lerp3(input.fromTarget, input.standingTarget, ramp(p, TARGET_TURN_FROM, 1)),
  })
}

/**
 * 俯冲途中的近裁剪面。
 *
 * 地表的近裁剪面按眼高算（0.0004 量级）。高空还带着它的话，宇宙尺度的深度精度会崩，
 * 星星和轨道环会闪。按离地高度连续过渡，落地前才收到地表那个值。
 */
export function surfaceEntryNearPlane(
  altitudeAboveGround: number, surfaceNear: number, universeNear: number,
): number {
  const near = Math.max(1e-6, Number.isFinite(surfaceNear) ? surfaceNear : 1e-3)
  const far = Math.max(near, Number.isFinite(universeNear) ? universeNear : near)
  const altitude = Number.isFinite(altitudeAboveGround) ? Math.max(0, altitudeAboveGround) : 0
  return Math.min(far, Math.max(near, altitude * 0.25))
}
