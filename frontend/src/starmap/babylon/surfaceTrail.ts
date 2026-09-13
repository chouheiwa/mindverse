import type { Vec3 } from './cubeSphere'

// 从落点铺一条踩出来的小径，指向你在时间上接着看的那个问题；尽头一块路牌。
// 这是「看见自己在往哪走」最直接的画面：一个人站在自己的问题上，看见自己走过的路。

export interface SurfaceTrailLayout {
  /** 保留落点以让横板正对观察者；手工布局可以省略，回退到第一枚脚印。 */
  readonly landing?: Vec3
  /** 每个脚印的单位方向（星心指向），由近到远。 */
  readonly steps: readonly Vec3[]
  /** 路牌的单位方向。 */
  readonly signpost: Vec3
}

// 眼高 0.012R 时地平线约 0.155 rad；路牌收近到 0.060 rad，留出遮挡余量。
const TRAIL_START = 0.012
const TRAIL_END = 0.054
const TRAIL_STEP = 0.006
const SIGNPOST_ANGLE = 0.060
/** 脚印左右交替错开的幅度（弧度）。 */
const STRIDE_SWAY = 0.0025

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2])
  return length > 1e-9 && Number.isFinite(length) ? [v[0] / length, v[1] / length, v[2] / length] : [0, 1, 0]
}
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** `bearing` 是要去的方向（世界坐标）；投到切平面上决定小径朝向。 */
export function layoutSurfaceTrail(landing: Vec3, bearing: Vec3): SurfaceTrailLayout {
  const up = normalize(landing)
  const safeBearing: Vec3 = bearing.every(Number.isFinite) ? bearing : [0, 0, 0]
  const along = dot(safeBearing, up)
  let forward = normalize([safeBearing[0] - up[0] * along, safeBearing[1] - up[1] * along, safeBearing[2] - up[2] * along])
  if (Math.hypot(...cross(up, forward)) < 1e-6) {
    forward = normalize(cross(Math.abs(up[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0], up))
  }
  const right = normalize(cross(forward, up))
  const at = (angle: number, sway: number): Vec3 => {
    const tangent: Vec3 = [
      forward[0] * Math.cos(sway) + right[0] * Math.sin(sway),
      forward[1] * Math.cos(sway) + right[1] * Math.sin(sway),
      forward[2] * Math.cos(sway) + right[2] * Math.sin(sway),
    ]
    return normalize([
      up[0] * Math.cos(angle) + tangent[0] * Math.sin(angle),
      up[1] * Math.cos(angle) + tangent[1] * Math.sin(angle),
      up[2] * Math.cos(angle) + tangent[2] * Math.sin(angle),
    ])
  }
  const steps: Vec3[] = []
  for (let index = 0, angle = TRAIL_START; angle <= TRAIL_END + 1e-9; index += 1, angle += TRAIL_STEP) {
    // 左右脚交替：偏移是角度而不是位置，换一颗大小不同的行星步幅观感一致。
    steps.push(at(angle, (index % 2 === 0 ? 1 : -1) * STRIDE_SWAY / Math.max(angle, TRAIL_START)))
  }
  return Object.freeze({ landing: up, steps: Object.freeze(steps), signpost: at(SIGNPOST_ANGLE, 0) })
}
