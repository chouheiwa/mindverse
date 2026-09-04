import type { PlanetSurfaceDescriptor } from './planetSurface'

export type PlanetTerrainLevel = 'low' | 'medium' | 'high'

export interface PlanetCrater {
  readonly direction: readonly [number, number, number]
  readonly radius: number
  readonly depth: number
  readonly rim: number
}

export interface PlanetTerrainDescriptor {
  readonly octaves: 3 | 5 | 6
  readonly warpStrength: number
  readonly ridgeStrength: number
  readonly largeCraters: readonly PlanetCrater[]
  readonly smallCraterBudget: number
  readonly smallCraterThreshold: number
}

const LARGE_CRATER_LIMIT = 8
const MAX_SMALL_CRATER_BUDGET = 48 - LARGE_CRATER_LIMIT
const OCTAVES: Readonly<Record<PlanetTerrainLevel, 3 | 5 | 6>> = Object.freeze({
  low: 3,
  medium: 5,
  high: 6,
})

export function buildPlanetTerrain(
  surface: PlanetSurfaceDescriptor,
  level: PlanetTerrainLevel,
): PlanetTerrainDescriptor {
  const craterCount = clampInteger(surface.craterCount, 0, 48)
  const largeCraterCount = Math.min(
    craterCount,
    Math.min(LARGE_CRATER_LIMIT, Math.max(2, Math.round(craterCount * 0.16))),
  )
  const random = xorshift32(surface.seed)
  const largeCraters = Object.freeze(Array.from(
    { length: largeCraterCount },
    () => buildCrater(random),
  ))
  const smallCraterBudget = level === 'low' ? 0 : craterCount - largeCraterCount

  return Object.freeze({
    octaves: OCTAVES[level],
    warpStrength: clamp01(surface.detailDensity),
    ridgeStrength: clamp01(surface.faultStrength),
    largeCraters,
    smallCraterBudget,
    smallCraterThreshold: level === 'low'
      ? 0
      : clamp01(smallCraterBudget / MAX_SMALL_CRATER_BUDGET),
  })
}

function buildCrater(random: () => number): PlanetCrater {
  const vertical = random() * 2 - 1
  const azimuth = random() * Math.PI * 2
  const horizontal = Math.sqrt(Math.max(0, 1 - vertical * vertical))

  return Object.freeze({
    direction: Object.freeze([
      horizontal * Math.cos(azimuth),
      vertical,
      horizontal * Math.sin(azimuth),
    ]) as readonly [number, number, number],
    radius: 0.07 + random() * 0.11,
    depth: 0.025 + random() * 0.055,
    rim: 0.012 + random() * 0.028,
  })
}

function xorshift32(seed: number): () => number {
  let state = (seed >>> 0) || 0x9e37_79b9
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x1_0000_0000
  }
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  const finiteValue = Number.isFinite(value) ? value : minimum
  return Math.round(Math.min(maximum, Math.max(minimum, finiteValue)))
}

function clamp01(value: number): number {
  const finiteValue = Number.isFinite(value) ? value : 0
  return Math.min(1, Math.max(0, finiteValue))
}
