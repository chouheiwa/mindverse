// 公转数学。
//
// 坐标由后端的概念图力导向布局给出 —— 不是降维。降维（UMAP/t-SNE）的簇间
// 距离没有意义，实测与真实高维距离的 Spearman 相关仅约 0.3；若用它出坐标，
// 「为什么这两个星群离得远」就没有诚实的答案。
//
// 这里的 orbit() 与 gl/chunks.ts 的 orbitAround() 必须逐字同式：
// 恒星位置在 GPU 上算，而覆盖层（暗物质环、星群标签）仍在 CPU 上算，
// 两边算出不同的轨道就会错位。

/** 每个星群一根确定的自转轴 —— 同一份数据必须转出同一张图。 */
export function clusterAxis(g: number): [number, number, number] {
  const a: [number, number, number] = [
    Math.sin(g * 1.7 + 0.4),
    Math.cos(g * 2.3) + 0.55,
    Math.sin(g * 3.1 + 1.2),
  ]
  const n = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / n, a[1] / n, a[2] / n]
}

/**
 * 公转周期。
 *
 * T = 20 + 1.9·r^1.5，即开普勒式的「外圈更慢」，但加了 20 秒下限 ——
 * 纯 r^1.5 会让半径接近 0 的主星在原地飞转。这是为可看性做的偏离，不是算错。
 * 返回 0 表示不公转（半径太小）。
 */
export function orbitPeriod(
  p: readonly [number, number, number],
  center: readonly [number, number, number],
): number {
  const r = Math.hypot(p[0] - center[0], p[1] - center[1], p[2] - center[2])
  if (r < 0.35) return 0
  return Math.min(20 + 1.9 * Math.pow(r, 1.5), 120)
}

/** 公转：概念绕所属星群质心旋转（Rodrigues 旋转）。ms 为毫秒。 */
export function orbit(
  p: readonly [number, number, number],
  center: readonly [number, number, number],
  axis: readonly [number, number, number],
  ms: number,
): [number, number, number] {
  const period = orbitPeriod(p, center)
  if (period === 0) return [p[0], p[1], p[2]]

  const o = [p[0] - center[0], p[1] - center[1], p[2] - center[2]] as const
  const th = ((Math.PI * 2) / period) * (ms / 1000)
  const ct = Math.cos(th)
  const st = Math.sin(th)
  const kd = axis[0] * o[0] + axis[1] * o[1] + axis[2] * o[2]
  const cx = [
    axis[1] * o[2] - axis[2] * o[1],
    axis[2] * o[0] - axis[0] * o[2],
    axis[0] * o[1] - axis[1] * o[0],
  ]
  return [
    center[0] + o[0] * ct + cx[0] * st + axis[0] * kd * (1 - ct),
    center[1] + o[1] * ct + cx[1] * st + axis[1] * kd * (1 - ct),
    center[2] + o[2] * ct + cx[2] * st + axis[2] * kd * (1 - ct),
  ]
}

/** 采样一圈轨道点，用于画透视正确的轨道环。 */
export function orbitRing(
  center: readonly [number, number, number],
  axis: readonly [number, number, number],
  radius: number,
  samples = 44,
): [number, number, number][] {
  // 在垂直于 axis 的平面上取一组正交基
  const tmp: [number, number, number] =
    Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const u: [number, number, number] = [
    axis[1] * tmp[2] - axis[2] * tmp[1],
    axis[2] * tmp[0] - axis[0] * tmp[2],
    axis[0] * tmp[1] - axis[1] * tmp[0],
  ]
  const un = Math.hypot(u[0], u[1], u[2]) || 1
  u[0] /= un
  u[1] /= un
  u[2] /= un
  const v: [number, number, number] = [
    axis[1] * u[2] - axis[2] * u[1],
    axis[2] * u[0] - axis[0] * u[2],
    axis[0] * u[1] - axis[1] * u[0],
  ]

  const out: [number, number, number][] = []
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2
    const c = Math.cos(a) * radius
    const s = Math.sin(a) * radius
    out.push([
      center[0] + u[0] * c + v[0] * s,
      center[1] + u[1] * c + v[1] * s,
      center[2] + u[2] * c + v[2] * s,
    ])
  }
  return out
}
