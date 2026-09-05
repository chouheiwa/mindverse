import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { describe, expect, it } from 'vitest'
import type { Universe } from '../../types'
import { QUALITY_LEVELS } from '../quality'
import { babylonCinematicEnvironment } from './cinematic'
import { DustLayer, dustModeDimension, soloModeDimension } from './dustLayer'

function universe(particleCount = 24, soloCount = 4): Universe {
  return {
    clusters: [
      { g: 0, name: 'A', lead: 'a', c: [0, 0, 0], n: 9, o: 1, f: 1, hue: 218, sat: 70, mem: [] },
      { g: 1, name: 'B', lead: 'b', c: [12, 2, -4], n: 6, o: 0, f: 1, hue: 32, sat: 60, mem: [] },
    ],
    particles: Array.from({ length: particleCount }, (_, index) => (
      [index * 0.7, index * -0.3, index * 0.4, index % 2, index % 3 === 0 ? 1 : 0]
    )),
    solo: Array.from({ length: soloCount }, (_, index) => ({ c: `solo ${index}`, p: [index, index, index] })),
    wormholes: [{ a: 0, b: 1, z: 2 }],
    stars: [], questions: [], answers: [], probes: [], dark: [], nebula: [],
    meta: { own: 1 },
  } as unknown as Universe
}

function setup(quality: Parameters<typeof babylonCinematicEnvironment>[0] = 'high', options = {}) {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const source = universe()
  const layer = new DustLayer(scene, source, {
    reducedMotion: false, environment: babylonCinematicEnvironment(quality), ...options,
  })
  return { engine, scene, layer, source }
}

describe('DustLayer', () => {
  it('places one mote per real content particle and one glow per orphan concept', () => {
    const { layer, source } = setup()
    expect(layer.diagnostics().dustCount).toBe(source.particles.length)
    expect(layer.diagnostics().soloCount).toBe(source.solo.length)
    layer.dispose()
  })

  it('draws the whole field in two batches, not one draw call per mote', () => {
    const { layer } = setup()
    expect(layer.diagnostics().batchCount).toBe(2)
    expect(layer.diagnostics().geometryCount).toBe(2)
    layer.dispose()
  })

  it('marks the viewer\'s own content brighter and less saturated than collected content', () => {
    const { layer } = setup()
    const { ownSize, otherSize } = layer.diagnostics()
    expect(ownSize).toBeGreaterThan(otherSize)
    layer.dispose()
  })

  it('attenuates by mode exactly as the Three layer did', () => {
    expect(dustModeDimension('all', true)).toBe(1)
    expect(dustModeDimension('worm', true)).toBeCloseTo(0.9, 6)
    expect(dustModeDimension('worm', false)).toBeCloseTo(0.07, 6)
    expect(dustModeDimension('nebula', true)).toBeCloseTo(0.12, 6)
    expect(soloModeDimension('solo')).toBe(1)
    expect(soloModeDimension('all')).toBeCloseTo(0.34, 6)
    expect(soloModeDimension('dark')).toBeCloseTo(0.08, 6)
  })

  it('applies mode attenuation to the buffers it uploads', () => {
    const { layer, source } = setup()
    layer.setMode('solo', source, 0)
    const dimensions = layer.diagnostics().soloDimensions
    expect(dimensions.length).toBe(source.solo.length)
    for (const value of dimensions) expect(value).toBeCloseTo(1, 6)
    layer.setMode('all', source, 0)
    for (const value of layer.diagnostics().soloDimensions) expect(value).toBeCloseTo(0.34, 6)
    layer.dispose()
  })

  it('retreats behind a focused system without disappearing', () => {
    const { layer } = setup()
    const lit = layer.diagnostics().gains
    layer.setDim(0.3)
    const dimmed = layer.diagnostics().gains
    for (let index = 0; index < lit.length; index += 1) {
      expect(dimmed[index]!).toBeCloseTo(lit[index]! * 0.3, 6)
      expect(dimmed[index]!).toBeGreaterThan(0)
    }
    layer.dispose()
  })

  it('thins density with quality but never drops the layer', () => {
    const counts = QUALITY_LEVELS.map((quality) => {
      const { layer } = setup(quality)
      const { dustCount, soloCount, batchCount } = layer.diagnostics()
      expect(batchCount).toBe(2)
      expect(dustCount).toBeGreaterThan(0)
      expect(soloCount).toBeGreaterThan(0)
      layer.dispose()
      return dustCount
    })
    expect(counts[0]).toBeGreaterThanOrEqual(counts[1]!)
    expect(counts[1]).toBeGreaterThanOrEqual(counts[2]!)
    expect(counts[2]).toBeLessThan(counts[0]!)
  })

  it('releases every mesh, material and geometry it created', () => {
    const { scene, layer } = setup()
    expect(scene.meshes.length).toBe(2)
    layer.dispose()
    expect(scene.meshes.length).toBe(0)
    expect(scene.materials.length).toBe(0)
    expect(() => layer.dispose()).not.toThrow()
  })
})
