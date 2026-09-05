export type PlanetLod = 'low' | 'medium' | 'high'

/**
 * Returns the projected planet diameter as a fraction of the canvas short edge.
 * `verticalFov` is expressed in radians and `cameraDistance` is centre-to-centre.
 */
export function projectedCoverage(
  radius: number,
  cameraDistance: number,
  verticalFov: number,
  renderWidth: number,
  renderHeight: number,
): number {
  if (![radius, cameraDistance, verticalFov, renderWidth, renderHeight].every(Number.isFinite)
    || radius <= 0
    || cameraDistance <= radius
    || verticalFov <= 0
    || verticalFov >= Math.PI
    || renderWidth <= 0
    || renderHeight <= 0) return 0

  const angularRadius = Math.asin(Math.min(1, radius / cameraDistance))
  const diameterPixels = Math.tan(angularRadius) * renderHeight / Math.tan(verticalFov * 0.5)
  return Math.min(1, Math.max(0, diameterPixels / Math.min(renderWidth, renderHeight)))
}

export function projectedSphereDiameterPixels(
  radius: number,
  cameraDistance: number,
  verticalFov: number,
  renderWidth: number,
  renderHeight: number,
): number {
  return projectedCoverage(radius, cameraDistance, verticalFov, renderWidth, renderHeight)
    * Math.min(renderWidth, renderHeight)
}

/**
 * 未聚焦行星的层级阶梯，与 gl/planetMaterials.ts::nextPlanetLod 逐字一致：
 * 投影半径 ≥18px 升到 medium、<12px 退回 far、≥84px 升到 near、≤72px 退回 medium。
 *
 * 迁移版换成了「占屏比例」阈值，于是同一颗行星在 720p 和 1440p 上会落到不同的
 * 档 —— 旧版的阶梯本来就是按像素定的，占屏比例是另一个量。
 */
function threeTier(current: PlanetLod, projectedRadiusPx: number): PlanetLod {
  const radius = Number.isFinite(projectedRadiusPx) ? Math.max(0, projectedRadiusPx) : 0
  if (current === 'low') return radius >= 18 ? 'medium' : 'low'
  if (current === 'high') return radius <= 72 ? 'medium' : 'high'
  if (radius < 12) return 'low'
  if (radius >= 84) return 'high'
  return 'medium'
}

/**
 * 被选中的行星恒取最细的表面。
 *
 * Three 的 near 档要 84px 投影半径才到，而按旧版取景（planetFocusDistance
 * 2.8–6.0）聚焦行星只有 20–39px —— 旧版是在阅读工作台把镜头拉到
 * PLANET_NEAR = 1.2 时才跨过那道线的。这里提前一档：近景里主体只有一个，
 * 它就是画面本身，没有理由让它停在中等表面上。这是一处**记录在案的**
 * 与旧版的偏差，不是阈值放宽 —— 未聚焦行星走的仍是 Three 逐字的像素阶梯。
 */
export function initialPlanetLod(projectedRadiusPx: number, focused: boolean): PlanetLod {
  if (focused) return 'high'
  return threeTier('low', projectedRadiusPx)
}

export function nextPlanetLod(
  current: PlanetLod,
  projectedRadiusPx: number,
  focused: boolean,
): PlanetLod {
  if (focused) return 'high'
  return threeTier(current, projectedRadiusPx)
}
