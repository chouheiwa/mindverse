import { describe, expect, it } from 'vitest'
import type { Universe } from '../types'
import { NEBULA_PALETTE_FALLBACK, nebulaPaletteRgb } from './nebulaPalette'

const cluster = (g: number, n: number, hue: number, sat: number) => ({ g, n, hue, sat } as Universe['clusters'][number])

describe('nebulaPaletteRgb', () => {
  it('derives three tints from the three largest clusters', () => {
    const palette = nebulaPaletteRgb([
      cluster(0, 3, 218, 70), cluster(1, 9, 32, 60), cluster(2, 6, 218, 20),
    ])
    expect(palette).toHaveLength(3)
    for (const tint of palette) {
      expect(tint).toHaveLength(3)
      for (const channel of tint) expect(channel).toBeGreaterThanOrEqual(0)
    }
    // Deep blue-violet body, magenta highlight, cyan rim: the rim must stay the
    // coolest of the three or the outer shell reads as a chromatic fringe.
    expect(palette[2]![2]).toBeGreaterThan(palette[2]![0]!)
  })

  it('pulls the rim tint towards white before mixing so amber clusters cannot fringe it', () => {
    const cool = nebulaPaletteRgb([cluster(0, 9, 218, 70), cluster(1, 6, 218, 70), cluster(2, 3, 218, 70)])
    const warm = nebulaPaletteRgb([cluster(0, 9, 218, 70), cluster(1, 6, 218, 70), cluster(2, 3, 32, 68)])
    const shift = Math.hypot(...cool[2]!.map((channel, index) => channel - warm[2]![index]!))
    expect(shift).toBeLessThan(0.12)
  })

  it('is deterministic and falls back when the universe has no clusters', () => {
    const first = nebulaPaletteRgb([cluster(0, 5, 218, 70)])
    const second = nebulaPaletteRgb([cluster(0, 5, 218, 70)])
    expect(first).toEqual(second)
    expect(nebulaPaletteRgb([])).toEqual(NEBULA_PALETTE_FALLBACK)
  })
})
