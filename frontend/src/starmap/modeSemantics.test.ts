import { describe, expect, it } from 'vitest'
import type { Mode, Universe } from '../types'
import { MODE_KEYS, describeMode } from './modeSemantics'

const universe = (): Universe => ({
  clusters: [
    { g: 0, name: 'A', lead: 'a', c: [0, 0, 0], n: 9, o: 1, f: 1, hue: 218, sat: 70, mem: ['a'] },
    { g: 1, name: 'B', lead: 'b', c: [12, 2, -4], n: 6, o: 0, f: 1, hue: 32, sat: 60, mem: ['b'] },
  ],
  stars: [
    { id: 's-a', c: 'a', g: 0, p: [1, 0, 0], n: 5, o: 2, f: 1, hue: 218, sat: 70, pe: 1, bu: 0 },
    { id: 's-b', c: 'b', g: 1, p: [12, 2, -3], n: 4, o: 0, f: 3, hue: 32, sat: 60, pe: 0.5, bu: 0 },
  ],
  wormholes: [{ a: 0, b: 1, z: 2 }],
  dark: [{ c: 'b', f: 3 }],
  nebula: [{ c: 'a', z: 1 }],
  solo: [{ c: 'orphan', p: [4, 4, 4] }],
  particles: [[0, 0, 0, 0, 1]],
  questions: [], answers: [], probes: [],
  meta: { own: 1 },
} as unknown as Universe)

describe('describeMode', () => {
  it('covers every button the mode bar offers', () => {
    expect([...MODE_KEYS]).toEqual(['all', 'worm', 'dark', 'nebula', 'solo', 'me'])
  })

  it('never answers a mode by dimming everything and emphasising nothing', () => {
    for (const mode of MODE_KEYS) {
      const semantics = describeMode(mode as Mode, universe(), 0)
      const emphasised = Object.entries(semantics.layers)
        .filter(([, value]) => value >= 1)
        .map(([layer]) => layer)
      expect(emphasised, `${mode} must emphasise at least one data layer`).not.toHaveLength(0)
    }
  })

  it('routes each mode to the data layer that carries its meaning', () => {
    const source = universe()
    expect(describeMode('worm', source, 0).layers.wormholes).toBe(1)
    expect(describeMode('dark', source, 0).layers.darkMatter).toBe(1)
    expect(describeMode('solo', source, 0).layers.soloParticles).toBe(1)
    expect(describeMode('nebula', source, 0).layers.nebulaStars).toBe(1)
    expect(describeMode('me', source, 0).layers.ownStars).toBe(1)
    expect(describeMode('all', source, 0).layers.clusterRings).toBe(1)
  })

  it('keeps the layers a mode is not about present but recessive, never hidden', () => {
    for (const mode of MODE_KEYS) {
      const semantics = describeMode(mode as Mode, universe(), 0)
      for (const [layer, value] of Object.entries(semantics.layers)) {
        expect(value, `${mode}/${layer}`).toBeGreaterThanOrEqual(0)
        expect(value, `${mode}/${layer}`).toBeLessThanOrEqual(1)
      }
      // The wormhole stream is the one layer that is genuinely modal.
      expect(semantics.layers.wormholes).toBe(mode === 'worm' ? 1 : 0)
    }
  })

  it('reports which cluster ids a wormhole mode keeps lit', () => {
    const source = universe()
    expect(describeMode('worm', source, 0).wormholeClusters).toEqual([0, 1])
    expect(describeMode('all', source, 0).wormholeClusters).toEqual([])
    // An out-of-range index must not throw or invent a wormhole.
    expect(describeMode('worm', source, 9).wormholeClusters).toEqual([])
  })

  it('names the concepts each mode singles out so panels and画面 agree', () => {
    const source = universe()
    expect(describeMode('dark', source, 0).highlightedConcepts).toEqual(['b'])
    expect(describeMode('nebula', source, 0).highlightedConcepts).toEqual(['a'])
    expect(describeMode('solo', source, 0).highlightedConcepts).toEqual(['orphan'])
    expect(describeMode('me', source, 0).highlightedConcepts).toEqual(['a'])
    expect(describeMode('all', source, 0).highlightedConcepts).toEqual([])
  })
})
