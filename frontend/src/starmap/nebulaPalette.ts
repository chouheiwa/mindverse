import type { Universe } from '../types'
import { starColor } from './gl/blackbody'

// 星云配色：取自本人最大的三个星群，所以背景也是数据的一部分。
//
// 与渲染器无关，Three 与 Babylon 共用同一份取值 —— 两边算出不同的底色，
// 从落地页点进星图就会像换了个产品。

export type PaletteRgb = readonly [number, number, number]

export const NEBULA_PALETTE_FALLBACK: readonly PaletteRgb[] = Object.freeze([
  Object.freeze([0.12, 0.19, 0.66] as const),
  Object.freeze([0.54, 0.16, 0.60] as const),
  Object.freeze([0.04, 0.42, 0.48] as const),
])

const lerp = (from: PaletteRgb, to: PaletteRgb, amount: number): PaletteRgb => Object.freeze([
  from[0] + (to[0] - from[0]) * amount,
  from[1] + (to[1] - from[1]) * amount,
  from[2] + (to[2] - from[2]) * amount,
] as const)

const WHITE: PaletteRgb = Object.freeze([1, 1, 1] as const)

/**
 * @param clusters 星群列表；空列表回落到固定的深蓝紫 / 洋红紫 / 青。
 */
export function nebulaPaletteRgb(
  clusters: readonly Pick<Universe['clusters'][number], 'g' | 'n' | 'hue' | 'sat'>[],
): readonly PaletteRgb[] {
  const top = [...clusters].sort((left, right) => right.n - left.n).slice(0, 3)
  if (top.length === 0) return NEBULA_PALETTE_FALLBACK
  const tint = (index: number): PaletteRgb => {
    const cluster = top[index] ?? top[0]!
    return Object.freeze(starColor(cluster.hue, cluster.sat) as unknown as PaletteRgb)
  }
  // 边缘那层是青色，而青与琥珀是补色，直接按 26% 混会混出脏黄绿。
  // 先把它拉向白再混：保留亮度上的呼应，不引进对冲的色相。
  const pale = lerp(tint(2), WHITE, 0.62)
  return Object.freeze([
    lerp(NEBULA_PALETTE_FALLBACK[0]!, tint(0), 0.26),
    lerp(NEBULA_PALETTE_FALLBACK[1]!, tint(1), 0.30),
    lerp(NEBULA_PALETTE_FALLBACK[2]!, pale, 0.26),
  ])
}
