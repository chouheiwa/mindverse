import type { Star } from '../types'

/** Modern stars are scope-aware entities; only legacy stars fall back to concept text. */
export function starIdentity(star: Star): string {
  return 'id' in star ? star.id : star.c
}
