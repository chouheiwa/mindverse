import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PLANET_WORLD_MAX, PLANET_WORLD_MIN, planetWorldRadius } from './planetMaterials'

describe('planetWorldRadius', () => {
  it('is the single source both renderers derive the world radius from', () => {
    expect(PLANET_WORLD_MIN).toBe(0.085)
    expect(PLANET_WORLD_MAX).toBe(0.2)
    for (const module of ['src/starmap/gl/bodies.ts', 'src/starmap/babylon/PlanetVisual.ts']) {
      const source = readFileSync(module, 'utf8')
      expect(source).toMatch(/planetWorldRadius\(/)
      // 谁都不许再自带一份行星半径常数。
      expect(source).not.toMatch(/PLANET_(?:MIN|MAX) = /)
    }
  })

  it('spans the answer density linearly and clamps hostile input', () => {
    expect(planetWorldRadius(0)).toBeCloseTo(0.085, 6)
    expect(planetWorldRadius(1)).toBeCloseTo(0.2, 6)
    expect(planetWorldRadius(0.5)).toBeCloseTo(0.1425, 6)
    expect(planetWorldRadius(Number.NaN)).toBeCloseTo(0.085, 6)
    expect(planetWorldRadius(9)).toBeCloseTo(0.2, 6)
  })
})
