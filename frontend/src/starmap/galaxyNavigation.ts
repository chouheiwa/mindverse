import type { Cluster, Star } from '../types'

export function galaxyName(cluster: Pick<Cluster, 'name'>): string {
  return cluster.name.replace(/(?:星群|星系)$/, '') + '星系'
}

/** Cluster remains the stored identity; a galaxy is now a navigable group of stars. */
export function galaxyFrame(cluster: Cluster, stars: readonly Star[], verticalFov: number, aspect: number) {
  const members = stars.filter((star) => star.g === cluster.g)
  const center = cluster.c
  const extent = Math.max(6, ...members.map((star) => Math.hypot(
    star.p[0] - center[0], star.p[1] - center[1], star.p[2] - center[2],
  ) + 2))
  const halfFov = Math.min(verticalFov / 2, Math.atan(Math.tan(verticalFov / 2) * Math.max(0.3, aspect)))
  return { center, extent, radius: extent / Math.sin(halfFov) * 1.15, members }
}

export interface ProjectedGalaxy {
  id: number
  x: number
  y: number
  radius: number
  depth: number
}

/** Prefer the closest group centre relative to its footprint when galaxies overlap. */
export function pickGalaxy(x: number, y: number, galaxies: readonly ProjectedGalaxy[]): number | null {
  let winner: number | null = null
  let score = Infinity
  for (const galaxy of galaxies) {
    if (!(galaxy.depth > 0 && galaxy.depth < 1) || !Number.isFinite(galaxy.radius)) continue
    const distance = Math.hypot(x - galaxy.x, y - galaxy.y)
    const radius = Math.max(40, galaxy.radius)
    const next = distance / radius
    if (next <= 1 && next < score) { winner = galaxy.id; score = next }
  }
  return winner
}
