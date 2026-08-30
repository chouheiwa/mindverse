/** CPU mirrors of the planet vertex shader's visibility gates. */
export const PLANET_STAR_LOD_START_PX = 13
export const PLANET_STAR_LOD_END_PX = 40
export const PLANET_CONVERGENCE_START = 0.90
export const PLANET_ALPHA_DISCARD = 0.004

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value))
export const smoothstep = (low: number, high: number, value: number): number => {
  const t = clamp((value - low) / Math.max(1e-6, high - low), 0, 1)
  return t * t * (3 - 2 * t)
}

export interface PlanetVisibilityInput {
  starPx: number
  convergence: number
  modeDim: number
  viewZ: number
  near: number
  far: number
  clipZ: number
}

export function planetVisualAlpha(input: PlanetVisibilityInput): number {
  const depth = clamp((input.far - input.viewZ) / Math.max(1e-3, input.far - input.near), 0, 1)
  return input.modeDim
    * smoothstep(PLANET_STAR_LOD_START_PX, PLANET_STAR_LOD_END_PX, input.starPx)
    * smoothstep(PLANET_CONVERGENCE_START, 1, input.convergence)
    * depth * depth
}

export function planetPickVisible(input: PlanetVisibilityInput): boolean {
  return input.clipZ >= -1 && input.clipZ <= 1 && planetVisualAlpha(input) > PLANET_ALPHA_DISCARD
}

export function indexPlanetsByStar<S extends object, P extends { star: S }>(planets: readonly P[]): ReadonlyMap<S, readonly P[]> {
  const grouped = new Map<S, P[]>()
  for (const planet of planets) {
    const system = grouped.get(planet.star)
    if (system) system.push(planet)
    else grouped.set(planet.star, [planet])
  }
  return grouped
}

export function findQuestionPlanet<P extends {
  star: { s: object }
  question: { id: string }
}>(planets: readonly P[], starId: string, questionId: string): P | null {
  return planets.find((planet) =>
    'id' in planet.star.s && planet.star.s.id === starId && planet.question.id === questionId) ?? null
}
