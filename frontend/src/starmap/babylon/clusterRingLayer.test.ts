import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { describe, expect, it } from 'vitest'
import type { Universe } from '../../types'
import {
  CLUSTER_RING_GAIN,
  ClusterRingLayer,
  ringRadiiForCluster,
  type RingStar,
} from './clusterRingLayer'

const universe = (): Universe => ({
  clusters: [
    { g: 0, name: 'A', lead: 'a', c: [0, 0, 0], n: 9, o: 1, f: 1, hue: 218, sat: 70, mem: ['a1', 'a2'] },
    { g: 1, name: 'B', lead: 'b', c: [40, 0, 0], n: 6, o: 0, f: 1, hue: 32, sat: 60, mem: ['b1'] },
  ],
  stars: [
    { id: 'a1', c: 'a1', g: 0, p: [6, 0, 0], n: 5, o: 2, f: 1, hue: 218, sat: 70, pe: 1, bu: 0 },
    { id: 'a2', c: 'a2', g: 0, p: [0, 0, 11], n: 4, o: 0, f: 1, hue: 218, sat: 70, pe: 1, bu: 0 },
    { id: 'b1', c: 'b1', g: 1, p: [40, 9, 0], n: 4, o: 0, f: 1, hue: 32, sat: 60, pe: 1, bu: 0 },
  ],
  wormholes: [{ a: 0, b: 1, z: 2 }],
  dark: [], nebula: [], solo: [], particles: [], questions: [], answers: [], probes: [],
  meta: { own: 1 },
} as unknown as Universe)

function setup() {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const source = universe()
  const layer = new ClusterRingLayer(scene, source)
  return { engine, scene, layer, source }
}

describe('ringRadiiForCluster', () => {
  it('draws one ring per distinct member orbit radius, ignoring the very centre', () => {
    const source = universe()
    expect(ringRadiiForCluster(source.clusters[0]!, source.stars as readonly RingStar[])).toEqual([6, 11])
    expect(ringRadiiForCluster(source.clusters[1]!, source.stars as readonly RingStar[])).toEqual([9])
  })

  it('rejects radii inside 1.5 units so a star at the centroid draws no ring', () => {
    const source = universe()
    const cluster = { ...source.clusters[0]!, mem: ['tiny'] }
    const stars = [{ ...source.stars[0]!, c: 'tiny', p: [0.4, 0, 0] as [number, number, number] }]
    expect(ringRadiiForCluster(cluster, stars as readonly RingStar[])).toEqual([])
  })
})

describe('ClusterRingLayer', () => {
  it('renders every cluster in one line batch', () => {
    const { layer, scene } = setup()
    expect(layer.diagnostics().ringCount).toBe(3)
    expect(layer.diagnostics().batchCount).toBe(1)
    expect(scene.meshes.length).toBe(1)
    layer.dispose()
  })

  it('keeps rings fully lit in all mode and recessive elsewhere, never at zero', () => {
    const { layer, source } = setup()
    layer.setMode('all', source, 0)
    expect(Math.max(...layer.diagnostics().dimensions)).toBeCloseTo(1, 6)
    layer.setMode('nebula', source, 0)
    const recessive = layer.diagnostics().dimensions
    expect(Math.max(...recessive)).toBeCloseTo(0.14, 6)
    expect(Math.min(...recessive)).toBeGreaterThan(0)
    layer.dispose()
  })

  it('lights only the two wormhole clusters in wormhole mode', () => {
    const { layer, source } = setup()
    layer.setMode('worm', source, 0)
    const lit = layer.diagnostics().dimensions
    expect(Math.max(...lit)).toBeCloseTo(1, 6)
    // Both clusters are wormhole ends here, so nothing may be extinguished.
    expect(Math.min(...lit)).toBeCloseTo(1, 6)
    layer.dispose()
  })

  it('recesses clusters the viewer is not focused on', () => {
    const { layer, source } = setup()
    layer.setMode('all', source, 0)
    layer.setFocus(0)
    const dimensions = layer.diagnostics().dimensions
    expect(Math.max(...dimensions)).toBeCloseTo(1, 6)
    expect(Math.min(...dimensions)).toBeCloseTo(0.12, 6)
    layer.setFocus(null)
    expect(Math.min(...layer.diagnostics().dimensions)).toBeCloseTo(1, 6)
    layer.dispose()
  })

  it('releases its mesh, material and geometry', () => {
    const { scene, layer } = setup()
    layer.dispose()
    expect(scene.meshes.length).toBe(0)
    expect(scene.materials.length).toBe(0)
    expect(() => layer.dispose()).not.toThrow()
  })
})

describe('the zoom fade must be observable, because the parity descriptors cannot see it', () => {
  it('reports the gain actually handed to the material', () => {
    const { engine, layer } = setup()
    expect(layer.diagnostics().gain).toBeCloseTo(CLUSTER_RING_GAIN, 6)

    layer.setUniform('uGain', CLUSTER_RING_GAIN * 0.5)
    expect(layer.diagnostics().gain).toBeCloseTo(CLUSTER_RING_GAIN * 0.5, 6)

    layer.setUniform('uGain', 0)
    expect(layer.diagnostics().gain).toBe(0)
    layer.dispose()
    engine.dispose()
  })
})
