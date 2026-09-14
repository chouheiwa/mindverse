import { describe, expect, test } from 'vitest'
import { galaxyFrame, pickGalaxy } from './galaxyNavigation'
import type { Cluster, Star } from '../types'

describe('galaxy navigation', () => {
  test('frames every member and ignores stars in another galaxy', () => {
    const cluster = { g: 7, c: [10, 0, 0] } as Cluster
    const stars = [{ g: 7, p: [0, 0, 0] }, { g: 7, p: [22, 0, 0] }, { g: 8, p: [999, 0, 0] }] as Star[]
    const wide = galaxyFrame(cluster, stars, Math.PI / 3, 1.5)
    const narrow = galaxyFrame(cluster, stars, Math.PI / 3, 0.5)
    expect(wide.members).toHaveLength(2)
    expect(wide.extent).toBe(14)
    expect(wide.radius).toBeGreaterThan(wide.extent)
    expect(narrow.radius).toBeGreaterThan(wide.radius)
  })
  test('accepts the space around a galaxy and resolves overlapping footprints', () => {
    const galaxies = [
      { id: 7, x: 100, y: 100, radius: 80, depth: 0.5 },
      { id: 8, x: 200, y: 100, radius: 80, depth: 0.5 },
      { id: 9, x: 100, y: 100, radius: 999, depth: -1 },
    ]
    expect(pickGalaxy(130, 110, galaxies)).toBe(7)
    expect(pickGalaxy(170, 100, galaxies)).toBe(8)
    expect(pickGalaxy(400, 100, galaxies)).toBeNull()
  })
})
