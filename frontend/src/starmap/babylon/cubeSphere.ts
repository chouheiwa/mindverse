// 立方球：把球面切成 6 个面，每个面是一张规整的 UV 网格。
//
// 可环绕的星球不能用经纬球：两极的顶点会挤成一团，走到极点附近网格密度暴涨、
// 三角形退化成针，而赤道又稀。立方球六个面各自是均匀网格，任意一点附近的密度
// 都差不多，才谈得上「走到哪都一样」。
//
// UV 上还做了正切校正：直接把立方体顶点归一化，面心会被拉稀、面角会被挤密，
// 密度差近一倍。tan(u·π/4) 把这个差压到几个百分点。

export type CubeFace = 0 | 1 | 2 | 3 | 4 | 5

export type Vec3 = readonly [number, number, number]

/** 六个面的朝向与切向基。顺序即 face 编号：+X −X +Y −Y +Z −Z。 */
const FACES: readonly Readonly<{ axis: Vec3; right: Vec3; up: Vec3 }>[] = Object.freeze([
  { axis: [1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] },
  { axis: [-1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] },
  { axis: [0, 1, 0], right: [1, 0, 0], up: [0, 0, -1] },
  { axis: [0, -1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  { axis: [0, 0, 1], right: [1, 0, 0], up: [0, 1, 0] },
  { axis: [0, 0, -1], right: [-1, 0, 0], up: [0, 1, 0] },
])

export const CUBE_FACES: readonly CubeFace[] = Object.freeze([0, 1, 2, 3, 4, 5])

const QUARTER_PI = Math.PI / 4

const clampUnit = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(-1, value)) : 0

/** UV → 球面方向。u、v 取值 [-1, 1]，超出会被夹住而不是折回另一个面。 */
export function faceDirection(face: CubeFace, u: number, v: number): Vec3 {
  const { axis, right, up } = FACES[face]!
  const su = Math.tan(clampUnit(u) * QUARTER_PI)
  const sv = Math.tan(clampUnit(v) * QUARTER_PI)
  const x = axis[0] + right[0] * su + up[0] * sv
  const y = axis[1] + right[1] * su + up[1] * sv
  const z = axis[2] + right[2] * su + up[2] * sv
  const length = Math.hypot(x, y, z) || 1
  return [x / length, y / length, z / length]
}

/** 球面方向 → 面与 UV。与 faceDirection 互逆。 */
export function directionFace(direction: Vec3): Readonly<{ face: CubeFace; u: number; v: number }> {
  const [x, y, z] = direction
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z)
  if (!Number.isFinite(ax + ay + az) || ax + ay + az === 0) return { face: 0, u: 0, v: 0 }
  const face: CubeFace = ax >= ay && ax >= az
    ? (x >= 0 ? 0 : 1)
    : ay >= az ? (y >= 0 ? 2 : 3) : (z >= 0 ? 4 : 5)
  const { axis, right, up } = FACES[face]!
  const depth = x * axis[0] + y * axis[1] + z * axis[2]
  if (!(depth > 0)) return { face, u: 0, v: 0 }
  const su = (x * right[0] + y * right[1] + z * right[2]) / depth
  const sv = (x * up[0] + y * up[1] + z * up[2]) / depth
  return { face, u: Math.atan(su) / QUARTER_PI, v: Math.atan(sv) / QUARTER_PI }
}

/**
 * 面上一格的球面尺度，用于 LOD 判距：格子越大，能容忍的相机距离越远。
 * 取格子对角两点的球面弧长，比用平面边长更贴近真实观感。
 */
export function patchAngularSize(face: CubeFace, u: number, v: number, halfSize: number): number {
  const a = faceDirection(face, u - halfSize, v - halfSize)
  const b = faceDirection(face, u + halfSize, v + halfSize)
  const cosine = Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))
  return Math.acos(cosine)
}
