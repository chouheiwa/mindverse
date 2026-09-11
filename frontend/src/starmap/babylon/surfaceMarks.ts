import type { Vec3 } from './cubeSphere'

// 落地第一眼该看到「我和这颗星球的关系」：你创作的回答是插在地上的旗，收藏的是
// 石堆，就在落点前方视野里，走过去能点开原文。地层保留给「别人怎么回答的年代史」。

export type SurfaceMarkKind = 'flag' | 'cairn'

export interface SurfaceMark {
  readonly answerId: string
  readonly kind: SurfaceMarkKind
}

export interface SurfaceMarkPlacement extends SurfaceMark {
  /** 星心指向标记的单位方向。 */
  readonly direction: Vec3
}

/** 眼高 0.012R 的地平线在 0.155 rad；标记落在 0.04–0.10 rad：看得见、不在脚下。 */
const NEAR_ANGLE = 0.04
const FAR_ANGLE = 0.10
/** 前方 ±55° 的扇面。 */
const FAN_HALF_ANGLE = Math.PI * 55 / 180

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2])
  return length > 1e-9 && Number.isFinite(length) ? [v[0] / length, v[1] / length, v[2] / length] : [0, 1, 0]
}
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** 你的绑定决定标记：创作是旗（创作优先），收藏是石堆；没有你的痕迹就没有标记。 */
export function surfaceMarksFor(
  answers: readonly { readonly id: string; readonly bindings: readonly { readonly relation: string }[] }[],
): SurfaceMark[] {
  const marks: SurfaceMark[] = []
  for (const answer of answers) {
    const created = answer.bindings.some(({ relation }) => relation === 'created')
    const collected = answer.bindings.some(({ relation }) => relation === 'collected')
    if (created) marks.push({ answerId: answer.id, kind: 'flag' })
    else if (collected) marks.push({ answerId: answer.id, kind: 'cairn' })
  }
  return marks
}

/**
 * 把标记铺在落点前方的扇面里：按黄金角错开方位、按序号由近到远，彼此不挤。
 * `facing` 与落点方向共线（退化）时任取一个切向作为前方。
 */
export function layoutSurfaceMarks(landing: Vec3, facing: Vec3, marks: readonly SurfaceMark[]): SurfaceMarkPlacement[] {
  const up = normalize(landing)
  let forward = normalize([
    facing[0] - up[0] * dot(facing, up),
    facing[1] - up[1] * dot(facing, up),
    facing[2] - up[2] * dot(facing, up),
  ])
  if (!Number.isFinite(dot(facing, facing)) || Math.hypot(...cross(up, forward)) < 1e-6) {
    forward = normalize(cross(Math.abs(up[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0], up))
  }
  const right = normalize(cross(forward, up))
  const count = marks.length
  return marks.map((mark, index) => {
    // 方位：第一枚正前方，其后用低差异序列在扇面里向两侧错开；距离由近到远。
    const azimuth = (((index * 0.6180339887498949 + 0.5) % 1) - 0.5) * 2 * FAN_HALF_ANGLE
    const distance = count <= 1 ? (NEAR_ANGLE + FAR_ANGLE) / 2 : NEAR_ANGLE + (FAR_ANGLE - NEAR_ANGLE) * (index / (count - 1))
    const tangent: Vec3 = [
      forward[0] * Math.cos(azimuth) + right[0] * Math.sin(azimuth),
      forward[1] * Math.cos(azimuth) + right[1] * Math.sin(azimuth),
      forward[2] * Math.cos(azimuth) + right[2] * Math.sin(azimuth),
    ]
    const direction = normalize([
      up[0] * Math.cos(distance) + tangent[0] * Math.sin(distance),
      up[1] * Math.cos(distance) + tangent[1] * Math.sin(distance),
      up[2] * Math.cos(distance) + tangent[2] * Math.sin(distance),
    ])
    return { answerId: mark.answerId, kind: mark.kind, direction }
  })
}
