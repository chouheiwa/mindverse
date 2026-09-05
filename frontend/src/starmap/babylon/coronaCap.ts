// 聚焦恒星辉光的投影上限。
//
// Three 给每一层光晕都写了 `uMaxPx`：辉光 520、星芒 360、硬核 90 ——
// 「星芒是相机的衍射，不是天体的一部分：近距离不该跟着无限长大」。
// 迁移过来的 corona 是一块按世界尺寸缩放的公告板，没有这道上限，于是
// 飞到行星近景时那团白直接铺满画面，planet-focus 的覆盖率和暗部占比
// 也就整体高出一截。

/** gl/stars.ts matGlow 的 uMaxPx。 */
export const FOCUS_CORONA_MAX_PX = 520

function positive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * 把 corona 的缩放压到投影上限之内。
 *
 * @param bodyRadius 恒星球体半径（世界单位）。
 * @param coronaScale 该恒星本来的辉光倍数。
 * @param viewDistance 相机到恒星的距离。
 * @param projectionScale `renderHeight / 2 / tan(fov / 2)`。
 * @returns 实际该用的倍数，恒为正且不超过原值。
 */
export function cappedCoronaScale(
  bodyRadius: number,
  coronaScale: number,
  viewDistance: number,
  projectionScale: number,
): number {
  const radius = positive(bodyRadius, 0.3)
  const scale = positive(coronaScale, 2.5)
  const distance = positive(viewDistance, 1)
  const projection = positive(projectionScale, 1)
  const maxScale = FOCUS_CORONA_MAX_PX * distance / (2 * radius * projection)
  return Math.max(1e-3, Math.min(scale, maxScale))
}
