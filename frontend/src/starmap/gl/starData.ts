import type { Star, Universe } from '../../types'
import { clusterAxis, orbitPeriod } from '../projection'
import { starColor, temperature } from './blackbody'

// 每颗恒星的派生量，全项目唯一的真相源。
//
// 恒星的位置同时被三套着色器用到（点精灵、球体、行星），公式只要有一处
// 抄歪，天体就会和它的辉光、和它的行星错开。所以派生量在这里算一次，
// 三边共用同一份缓冲属性。

export const IGNITE_START = 5200
export const IGNITE_STEP = 62
export const IGNITE_MS = 700

export interface StarDatum {
  s: Star
  /** 布局给的原始坐标 */
  p: [number, number, number]
  /** 公转：绕所属星群质心 */
  center: [number, number, number]
  axis: [number, number, number]
  period: number
  /** 创世喷发起点 */
  start: [number, number, number]
  /** 点火时刻（毫秒） */
  ignite: number

  /** 点精灵的基础尺寸 */
  pointSize: number
  /**
   * 球体半径，世界单位。
   *
   * 刻意压得很小（0.30–1.25，而星群内部间距在 10–30）。半径给大了，
   * 全景一上来就是 83 个球，那不是星系是弹珠盒；给这么小，全景里
   * 最大的恒星也只有 6px 半径，得靠近才看得出它是个球。
   */
  bodyR: number
  bright: number
  burst: number
  seed: number
  rot: number
  color: [number, number, number]
  /** 色温，给表面着色器分辨米粒组织的粗糙程度 */
  kelvin: number

  /** 这颗恒星的行星系公转轴 */
  sysAxis: [number, number, number]
  /** 行星系的两个正交基，行星在这个平面上绕行 */
  sysU: [number, number, number]
  sysV: [number, number, number]
}

export function starData(u: Universe): StarDatum[] {
  const stars = u.stars
  const maxN = Math.max(1, ...stars.map((s) => s.n))

  const centerOf = new Map<number, [number, number, number]>()
  const axisOf = new Map<number, [number, number, number]>()
  for (const c of u.clusters) {
    centerOf.set(c.g, c.c)
    axisOf.set(c.g, clusterAxis(c.g))
  }

  // 点火顺序 = 持续性降序：越亮的星你追得越久，创世时也最先亮
  const ignite = new Map<string, number>()
  ;[...stars]
    .sort((a, b) => b.pe * Math.log(1 + b.n) - a.pe * Math.log(1 + a.n))
    .forEach((s, i) => ignite.set(s.c, IGNITE_START + i * IGNITE_STEP))

  const rnd = mulberry(97)
  return stars.map((s) => {
    const center = centerOf.get(s.g) ?? ([0, 0, 0] as [number, number, number])
    const axis = axisOf.get(s.g) ?? ([0, 1, 0] as [number, number, number])
    const k = s.n / maxN
    const sysAxis = systemAxis(s.c)
    const [sysU, sysV] = basis(sysAxis)

    return {
      s,
      p: [s.p[0], s.p[1], s.p[2]],
      center,
      axis,
      period: orbitPeriod(s.p, center),
      start: jet(rnd),
      ignite: ignite.get(s.c) ?? 0,
      pointSize: 3.4 + 11 * Math.pow(k, 0.55),
      bodyR: 0.30 + 0.95 * Math.pow(k, 0.55),
      bright: 0.3 + 0.7 * s.pe,
      burst: s.bu,
      seed: s.n,
      rot: rnd() * Math.PI,
      color: starColor(s.hue, s.sat),
      kelvin: temperature(s.hue, s.sat),
      sysAxis,
      sysU,
      sysV,
    }
  })
}

/** 恒星系的公转轴，由概念名定死 —— 同一份数据必须转出同一张图。 */
function systemAxis(name: string): [number, number, number] {
  let h = 2166136261
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const r = mulberry(h >>> 0)
  // 轴整体偏向「上」，行星盘才不会一半竖着一半横着看不出是个盘
  const a: [number, number, number] = [
    (r() - 0.5) * 1.3,
    0.75 + r() * 0.5,
    (r() - 0.5) * 1.3,
  ]
  const n = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / n, a[1] / n, a[2] / n]
}

/** 垂直于 axis 的一组正交基。 */
function basis(axis: readonly [number, number, number]):
  [[number, number, number], [number, number, number]] {
  const t: [number, number, number] = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const u: [number, number, number] = [
    axis[1] * t[2] - axis[2] * t[1],
    axis[2] * t[0] - axis[0] * t[2],
    axis[0] * t[1] - axis[1] * t[0],
  ]
  const un = Math.hypot(u[0], u[1], u[2]) || 1
  u[0] /= un; u[1] /= un; u[2] /= un
  const v: [number, number, number] = [
    axis[1] * u[2] - axis[2] * u[1],
    axis[2] * u[0] - axis[0] * u[2],
    axis[0] * u[1] - axis[1] * u[0],
  ]
  return [u, v]
}

function jet(rnd: () => number): [number, number, number] {
  const a = rnd() * Math.PI * 2
  const b = Math.acos(2 * rnd() - 1)
  const r = 2 + rnd() * 5
  return [r * Math.sin(b) * Math.cos(a), r * Math.sin(b) * Math.sin(a), r * Math.cos(b)]
}

export function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
