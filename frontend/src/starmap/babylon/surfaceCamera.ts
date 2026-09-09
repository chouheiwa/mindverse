import type { PlanetTerrainField } from './terrainField'
import type { Vec3 } from './cubeSphere'

// 球面行走相机。
//
// 关键是**朝向作为状态、沿大圆平行搬运**，而不是每步从一组全局参考基里重算。
// 后者有极点奇异：参考向量在 |up.y| ≈ 0.95 处切换，跨过那条线相机会猛地一甩；
// 实测沿大圆走满 2π 会偏出 0.31（约 18°），根本回不到原点。
//
// 走一步是平面内的一次精确旋转：
//   dir'    =  dir·cos θ + facing·sin θ
//   facing' = -dir·sin θ + facing·cos θ
// 这正是沿测地线的平行搬运，处处解析、没有奇异点，走满一圈精确闭合。
//
// 高度用地形场直接问，所以永远贴着真实地面 —— 不会陷进山里，也不会浮在半空。
// 这正是把地形搬到 CPU 换来的东西。

export interface SurfacePose {
  /** 站立点的球面方向（单位向量）。 */
  readonly direction: Vec3
  /** 朝向：站立点切平面内的单位向量。作为状态携带，避免极点处的基跳变。 */
  readonly facing: Vec3
  /** 俯仰，正为抬头。夹在 ±80° 内，避免视线翻过天顶。 */
  readonly pitch: number
  /** 离地高度（世界单位）。 */
  readonly eyeHeight: number
}

export interface SurfaceFrame {
  readonly position: Vec3
  readonly target: Vec3
  readonly up: Vec3
  /** 站立点的地面海拔（世界单位，含行星半径）。 */
  readonly groundRadius: number
}

export interface SurfaceWalkInput {
  /** 前后：正为向前。单位是弧度（沿球面走过的角度）。 */
  readonly forward: number
  /** 左右平移，同样是弧度。 */
  readonly strafe: number
  readonly turn: number
  readonly tilt: number
}

const MAX_PITCH = Math.PI * 4 / 9

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2])
  return length > 0 && Number.isFinite(length)
    ? [v[0] / length, v[1] / length, v[2] / length]
    : [0, 1, 0]
}

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

const scaleAdd = (a: Vec3, b: Vec3, k: number): Vec3 => [
  a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k,
]

/**
 * 站立点的切平面基。
 *
 * 参考向量在接近极点时换一根，否则叉乘退化成零向量 —— 那正是「走到极点相机
 * 乱转」的根源。
 */
export function surfaceBasis(direction: Vec3): Readonly<{ up: Vec3; north: Vec3; east: Vec3 }> {
  const up = normalize(direction)
  const reference: Vec3 = Math.abs(up[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0]
  const east = normalize(cross(reference, up))
  const north = normalize(cross(up, east))
  return Object.freeze({ up, north, east })
}

const clampPitch = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_PITCH, Math.max(-MAX_PITCH, value)) : 0

/** 把 facing 拉回 direction 的切平面并归一化，抵消长途行走的浮点漂移。 */
function orthonormalize(direction: Vec3, facing: Vec3): Readonly<{ up: Vec3; facing: Vec3 }> {
  const up = normalize(direction)
  const projection = facing[0] * up[0] + facing[1] * up[1] + facing[2] * up[2]
  const tangent: Vec3 = [
    facing[0] - up[0] * projection,
    facing[1] - up[1] * projection,
    facing[2] - up[2] * projection,
  ]
  const length = Math.hypot(tangent[0], tangent[1], tangent[2])
  // facing 与 up 共线时无法定义朝向，退回该点的一根确定切向。
  return Object.freeze({ up, facing: length > 1e-9 ? normalize(tangent) : surfaceBasis(up).north })
}

/** 在 (a, b) 张成的平面里把这一对基旋转 angle，返回旋转后的一对。 */
function rotatePair(a: Vec3, b: Vec3, angle: number): readonly [Vec3, Vec3] {
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return [
    [a[0] * cosine + b[0] * sine, a[1] * cosine + b[1] * sine, a[2] * cosine + b[2] * sine],
    [-a[0] * sine + b[0] * cosine, -a[1] * sine + b[1] * cosine, -a[2] * sine + b[2] * cosine],
  ]
}

/**
 * 沿球面走一步。
 *
 * 前进是在 (up, facing) 平面里旋转，平移是在 (up, right) 平面里旋转，两者都会
 * 同步搬运 facing —— 这就是平行搬运，也是「走满一圈精确回到原点」的来源。
 */
export function walkSurface(pose: SurfacePose, input: SurfaceWalkInput): SurfacePose {
  const start = orthonormalize(pose.direction, pose.facing)
  let up = start.up
  let facing = start.facing

  const turn = Number.isFinite(input.turn) ? input.turn : 0
  if (turn !== 0) {
    const right = normalize(cross(facing, up))
    const cosine = Math.cos(turn)
    const sine = Math.sin(turn)
    facing = normalize([
      facing[0] * cosine + right[0] * sine,
      facing[1] * cosine + right[1] * sine,
      facing[2] * cosine + right[2] * sine,
    ])
  }

  const forward = Number.isFinite(input.forward) ? input.forward : 0
  if (forward !== 0) {
    const [nextUp, nextFacing] = rotatePair(up, facing, forward)
    up = normalize(nextUp)
    facing = normalize(nextFacing)
  }

  const strafe = Number.isFinite(input.strafe) ? input.strafe : 0
  if (strafe !== 0) {
    const right = normalize(cross(facing, up))
    const [nextUp, nextRight] = rotatePair(up, right, strafe)
    up = normalize(nextUp)
    // facing 由新的 up 与搬运后的 right 重建，保持三者正交。
    facing = normalize(cross(up, normalize(nextRight)))
  }

  const settled = orthonormalize(up, facing)
  return Object.freeze({
    direction: settled.up,
    facing: settled.facing,
    pitch: clampPitch(pose.pitch + (Number.isFinite(input.tilt) ? input.tilt : 0)),
    eyeHeight: pose.eyeHeight,
  })
}

/** 由姿态解出相机的世界位置、注视点与上方向。 */
export function surfaceFrame(
  pose: SurfacePose,
  field: PlanetTerrainField,
  radius: number,
  displacement: number,
): SurfaceFrame {
  const { up, facing } = orthonormalize(pose.direction, pose.facing)
  const planetRadius = Number.isFinite(radius) && radius > 0 ? radius : 1
  const scale = Number.isFinite(displacement) ? displacement : 0
  const groundRadius = planetRadius * (1 + field.height(up) * scale)
  const eye = Math.max(0, Number.isFinite(pose.eyeHeight) ? pose.eyeHeight : 0)
  const position: Vec3 = [
    up[0] * (groundRadius + eye), up[1] * (groundRadius + eye), up[2] * (groundRadius + eye),
  ]
  const pitch = clampPitch(pose.pitch)
  const look = normalize(scaleAdd(
    [facing[0] * Math.cos(pitch), facing[1] * Math.cos(pitch), facing[2] * Math.cos(pitch)],
    up, Math.sin(pitch),
  ))
  return Object.freeze({
    position,
    target: scaleAdd(position, look, planetRadius * 0.5),
    up,
    groundRadius,
  })
}

/** 在给定点面朝局部北站好，作为落地时的初始姿态。 */
export function standAt(direction: Vec3, eyeHeight: number): SurfacePose {
  const { up, north } = surfaceBasis(direction)
  return Object.freeze({ direction: up, facing: north, pitch: 0, eyeHeight })
}
