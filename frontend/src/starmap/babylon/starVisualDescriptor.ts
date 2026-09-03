import type { StarDatum } from '../gl/starData'

export interface StarVisualDescriptor {
  readonly color: readonly [number, number, number]
  readonly luminance: number
  readonly panoramaCorePx: number
  readonly panoramaHaloPx: number
  readonly coronaScale: number
  readonly surfaceActivity: number
  readonly seed: number
}

export function describeStarVisual(star: StarDatum): StarVisualDescriptor {
  const bright = clamp(finite(star.bright, 0.5), 0, 2)
  const activity = clamp(finite(star.burst, 0), 0, 1)
  const core = clamp(2 + Math.log1p(bright * 3) * 2.15, 2, 7)

  return Object.freeze({
    color: sanitizeColor(star.color),
    luminance: clamp(0.72 + Math.log1p(bright * 4), 0.72, 2.4),
    panoramaCorePx: core,
    panoramaHaloPx: clamp(core * (2.5 + activity * 1.5), 6, 28),
    coronaScale: 2.5 + activity * 1.5,
    surfaceActivity: activity,
    seed: Math.abs(Math.trunc(finite(star.seed, 1))),
  })
}

function sanitizeColor(color: StarDatum['color']): readonly [number, number, number] {
  return Object.freeze([
    clamp(finite(color[0], 1), 0, 1),
    clamp(finite(color[1], 1), 0, 1),
    clamp(finite(color[2], 1), 0, 1),
  ] as const)
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
