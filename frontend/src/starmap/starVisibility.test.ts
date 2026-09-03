import { describe, expect, test } from 'vitest'
import type { Star, Universe } from '../types'
import { modeDim, renderDim, starInteractionEligible } from './starVisibility'

const star = (overrides: Partial<Star> = {}): Star => ({
  c: 'alpha', g: 1, p: [0, 0, 0], n: 3, o: 0, f: 0,
  hue: 0, sat: 0, pe: 1, bu: 0, fi: '', la: '', ev: [], ...overrides,
})
const universe = (overrides: Partial<Universe> = {}): Universe => ({
  meta: { items: 1, concepts: 1, clusters: 1, own: 1, fav: 0, span: [0, 0], medz: 0, p10z: 0, source: '', splits: 0 },
  clusters: [], stars: [], particles: [], wormholes: [], solo: [], dark: [], nebula: [],
  ...overrides,
}) as Universe

describe('pure star mode visibility', () => {
  test.each([['all', 1], ['solo', 0.12], ['me', 0.1]] as const)(
    'preserves %s mode dimming',
    (mode, expected) => expect(modeDim(star(), mode, universe(), 0)).toBe(expected),
  )

  test('keeps me mode visible when there is no authored footprint', () => {
    expect(modeDim(star(), 'me', universe({ meta: { ...universe().meta, own: 0 } }), 0)).toBe(1)
  })

  test('distinguishes interaction eligibility from dark-star render dimming', () => {
    const current = star()
    const u = universe({ dark: [{ c: current.c, n: 1, f: 0, o: 0, gap: 1, first: '', last: '', ev: [] }] })
    expect(modeDim(current, 'dark', u, 0)).toBe(1)
    expect(renderDim(current, 'dark', u, 0)).toBe(0.3)
  })

  test('excludes mode-hidden stars from screen-space picker eligibility', () => {
    expect(starInteractionEligible(star(), 'me', universe(), 0)).toBe(false)
    expect(starInteractionEligible(star({ o: 1 }), 'me', universe(), 0)).toBe(true)
  })
})
