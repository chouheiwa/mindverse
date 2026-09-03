import type { Mode, Star, Universe } from '../types'
import { starIdentity } from './starIdentity'

/** Mode emphasis stays pure so both renderer chunks share rules without sharing engines. */
export function modeDim(s: Star, mode: Mode, u: Universe, wormIdx: number): number {
  switch (mode) {
    case 'dark': return u.dark.some((d) => d.c === s.c) ? 1 : 0.08
    case 'nebula': return u.nebula.some((x) => x.c === s.c) ? 1 : 0.1
    case 'worm': {
      const w = u.wormholes[wormIdx]
      return w && (s.g === w.a || s.g === w.b) ? 1 : 0.11
    }
    case 'me': return u.meta.own === 0 ? 1 : s.o > 0 ? 1 : 0.1
    case 'solo': return 0.12
    default: return 1
  }
}

export function renderDim(s: Star, mode: Mode, u: Universe, wormIdx: number): number {
  const dimension = modeDim(s, mode, u, wormIdx)
  return u.dark.some((x) => x.c === s.c) ? Math.min(dimension, 0.3) : dimension
}

export function starInteractionEligible(s: Star, mode: Mode, u: Universe, wormIdx: number): boolean {
  return modeDim(s, mode, u, wormIdx) >= 0.4
}

/** Resolve the canonical domain object and apply the shared interaction guard. */
export function resolveInteractiveStar<T extends { readonly s: Star }>(
  stars: readonly T[],
  starKey: string,
  mode: Mode,
  universe: Universe,
  wormIdx: number,
): T | null {
  const datum = stars.find(({ s }) => starIdentity(s) === starKey) ?? null
  return datum && starInteractionEligible(datum.s, mode, universe, wormIdx) ? datum : null
}
