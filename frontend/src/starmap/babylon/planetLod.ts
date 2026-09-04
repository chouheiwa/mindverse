export type PlanetLod = 'low' | 'medium' | 'high'

const LOW_TO_MEDIUM = 0.045
const MEDIUM_TO_LOW = 0.03
const MEDIUM_TO_HIGH = 0.22
const HIGH_TO_MEDIUM = 0.16

function clampCoverage(coverage: number): number {
  return Number.isFinite(coverage) ? Math.min(1, Math.max(0, coverage)) : 0
}

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

export function initialPlanetLod(coverage: number, focused: boolean): PlanetLod {
  const value = clampCoverage(coverage)
  if (focused && value >= MEDIUM_TO_HIGH) return 'high'
  return value >= LOW_TO_MEDIUM ? 'medium' : 'low'
}

export function nextPlanetLod(current: PlanetLod, coverage: number, focused: boolean): PlanetLod {
  const value = clampCoverage(coverage)
  if (!focused && current === 'high') return 'medium'
  if (current === 'high') return value < HIGH_TO_MEDIUM ? 'medium' : 'high'
  if (current === 'medium') {
    if (focused && value >= MEDIUM_TO_HIGH) return 'high'
    return value < MEDIUM_TO_LOW ? 'low' : 'medium'
  }
  return value >= LOW_TO_MEDIUM ? 'medium' : 'low'
}
