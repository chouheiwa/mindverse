// 行星轨道的几何，两个渲染器共用。
//
// 这些数原本只写在 gl/bodies.ts 里，迁移时被手抄了一遍 —— 抄错了两处：
// 相位用了 1 起的轨道编号（第一颗行星整整错开 137.5°，近景里恒星因此
// 跑到画面另一侧），倾角整个丢了（所有轨道共面，恒星系退化成同心圆）。
// 放在这里，谁也不用再抄一次。

export type Vec3 = readonly [number, number, number]

const ORBIT_BASE = 2.1
const ORBIT_STEP = 1.15
/** 黄金角，让相邻轨道的行星不挤在同一侧。 */
const GOLDEN_ANGLE_DEGREES = 137.508
const SEED_DEGREES = 31.7
const TILT_RANGE = 0.22

function orbitIndexOf(orbitIndex: number): number {
  return Number.isFinite(orbitIndex) && orbitIndex > 0 ? Math.floor(orbitIndex) : 0
}

/** 第 `index` 条轨道的半径（index 从 0 起）。 */
export function orbitRadiusFor(index: number): number {
  return ORBIT_BASE + orbitIndexOf(index) * ORBIT_STEP
}

/** 开普勒式：外圈更慢。 */
export function orbitPeriodFor(radius: number): number {
  const r = Number.isFinite(radius) && radius > 0 ? radius : ORBIT_BASE
  return 7 + 2.4 * r ** 1.5
}

/** 起始相位（index 从 0 起，与 Three 的实例缓冲逐字一致）。 */
export function orbitPhase(index: number, seed: number): number {
  const safeSeed = Number.isFinite(seed) ? seed : 0
  return ((orbitIndexOf(index) * GOLDEN_ANGLE_DEGREES + safeSeed * SEED_DEGREES) * Math.PI) / 180
}

/**
 * 轨道面：整个恒星系共用一根轴，每条轨道再给一点点倾角 ——
 * 「才有层次不是同心圆」。
 */
export function orbitPlane(index: number, u: Vec3, v: Vec3, axis: Vec3): Readonly<{ u: Vec3; v: Vec3 }> {
  const idx = orbitIndexOf(index)
  const tilt = (((idx * 2654435761) % 1000) / 1000 - 0.5) * TILT_RANGE
  const cosine = Math.cos(tilt)
  const sine = Math.sin(tilt)
  const tiltedU: [number, number, number] = [
    u[0] * cosine + axis[0] * sine,
    u[1] * cosine + axis[1] * sine,
    u[2] * cosine + axis[2] * sine,
  ]
  const length = Math.hypot(tiltedU[0], tiltedU[1], tiltedU[2]) || 1
  tiltedU[0] /= length; tiltedU[1] /= length; tiltedU[2] /= length
  return Object.freeze({ u: Object.freeze(tiltedU), v: Object.freeze([v[0], v[1], v[2]] as const) })
}
