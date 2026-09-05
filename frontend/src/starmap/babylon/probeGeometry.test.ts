import { describe, expect, it } from 'vitest'
import {
  PROBE_MATERIALS,
  PROBE_PARTS,
  PROBE_RADIUS,
  nextProbeLod,
  partsForLod,
  probeLodWeights,
} from './probeGeometry'

describe('PROBE_PARTS', () => {
  it('describes a recognisable craft, not a sprite or a glyph', () => {
    const names = PROBE_PARTS.map(({ part }) => part)
    expect(names).toEqual([
      'hull', 'left-wing', 'right-wing', 'beacon',
      'antenna', 'thruster', 'left-hinge', 'right-hinge',
      'seam', 'scanner-lens', 'light-strip-inner', 'etching',
    ])
    // Every part is real geometry with a position on the airframe.
    for (const definition of PROBE_PARTS) {
      expect(definition.kind).toMatch(/cylinder|box|sphere|cone|torus|disc/)
      expect(definition.offset).toHaveLength(3)
      expect(PROBE_MATERIALS[definition.material]).toBeDefined()
    }
  })

  it('keeps the wings, hinges and beacon symmetric about the hull', () => {
    const byName = new Map(PROBE_PARTS.map((definition) => [definition.part, definition]))
    expect(byName.get('left-wing')!.offset[2]).toBeCloseTo(-byName.get('right-wing')!.offset[2]!, 6)
    expect(byName.get('left-hinge')!.offset[2]).toBeCloseTo(-byName.get('right-hinge')!.offset[2]!, 6)
    expect(byName.get('beacon')!.offset[1]).toBeGreaterThan(0)
    expect(byName.get('thruster')!.offset[0]).toBeLessThan(0)
  })

  it('carries the sci-fi material palette the product settled on', () => {
    expect(PROBE_MATERIALS.hull.metallic).toBeGreaterThan(0.5)
    expect(PROBE_MATERIALS.amber.emissiveIntensity).toBeGreaterThan(1)
    expect(PROBE_MATERIALS.light.emissiveIntensity).toBeGreaterThan(1)
    // The scanner lens is the only part that reads as glass.
    expect(PROBE_MATERIALS.lens.roughness).toBeLessThan(0.2)
  })
})

describe('partsForLod', () => {
  it('adds detail with each step and never removes a tier entirely', () => {
    const far = partsForLod('far').map(({ part }) => part)
    const medium = partsForLod('medium').map(({ part }) => part)
    const near = partsForLod('near').map(({ part }) => part)
    expect(far).toEqual(['hull', 'left-wing', 'right-wing', 'beacon'])
    expect(medium).toEqual([...far, 'antenna', 'thruster', 'left-hinge', 'right-hinge'])
    expect(near).toEqual([...medium, 'seam', 'scanner-lens', 'light-strip-inner', 'etching'])
    expect(far.length).toBeGreaterThan(0)
  })
})

describe('nextProbeLod', () => {
  it('mirrors the Three hysteresis ladder exactly', () => {
    expect(nextProbeLod('far', 27)).toBe('far')
    expect(nextProbeLod('far', 28)).toBe('medium')
    expect(nextProbeLod('medium', 14)).toBe('far')
    expect(nextProbeLod('medium', 15)).toBe('medium')
    expect(nextProbeLod('medium', 92)).toBe('near')
    expect(nextProbeLod('near', 76)).toBe('medium')
    expect(nextProbeLod('near', 77)).toBe('near')
  })

  it('sanitises a non-finite projection instead of promoting detail', () => {
    expect(nextProbeLod('near', Number.NaN)).toBe('medium')
    expect(nextProbeLod('far', Number.NaN)).toBe('far')
  })
})

describe('probeLodWeights', () => {
  it('cross-fades between neighbouring tiers so a switch is never a pop', () => {
    const mid = probeLodWeights('far', 24)
    expect(mid.far).toBeGreaterThan(0)
    expect(mid.medium).toBeGreaterThan(0)
    expect(mid.near).toBe(0)
    const settled = probeLodWeights('far', 5)
    expect(settled).toEqual({ far: 1, medium: 0, near: 0 })
  })

  it('always sums to one so the craft never half-disappears', () => {
    for (const lod of ['far', 'medium', 'near'] as const) {
      for (const px of [0, 14, 24, 28, 60, 80, 92, 400]) {
        const weights = probeLodWeights(lod, px)
        const total = weights.far + weights.medium + weights.near
        expect(total, `${lod}@${px}`).toBeCloseTo(1, 6)
      }
    }
  })
})

describe('PROBE_RADIUS', () => {
  it('matches the Three bounding radius used for projection', () => {
    expect(PROBE_RADIUS).toBeCloseTo(0.34, 6)
  })
})
