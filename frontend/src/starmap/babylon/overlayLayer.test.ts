import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { describe, expect, it } from 'vitest'
import type { Universe } from '../../types'
import { QUALITY_LEVELS } from '../quality'
import { OverlayLayer, WORMHOLE_MAX_POINT_PX, WORMHOLE_SAMPLES, wormholeCurvePoint, wormholePointSize } from './overlayLayer'

const universe = (): Universe => ({
  clusters: [
    { g: 0, name: 'A', lead: 'a', c: [0, 0, 0], n: 9, o: 1, f: 1, hue: 218, sat: 70, mem: ['a1'] },
    { g: 1, name: 'B', lead: 'b', c: [40, 0, 0], n: 6, o: 0, f: 1, hue: 32, sat: 60, mem: ['b1'] },
  ],
  stars: [
    { id: 'a1', c: 'a1', g: 0, p: [6, 0, 0], n: 5, o: 2, f: 1, hue: 218, sat: 70, pe: 1, bu: 0 },
    { id: 'b1', c: 'b1', g: 1, p: [40, 9, 0], n: 4, o: 0, f: 1, hue: 32, sat: 60, pe: 1, bu: 0 },
  ],
  wormholes: [{ a: 0, b: 1, z: 2 }],
  dark: [{ c: 'b1', f: 3 }],
  nebula: [], solo: [], particles: [], questions: [], answers: [], probes: [],
  meta: { own: 1 },
} as unknown as Universe)

function setup(quality: typeof QUALITY_LEVELS[number] = 'high') {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const source = universe()
  const layer = new OverlayLayer(scene, source, { quality, reducedMotion: false })
  return { engine, scene, layer, source }
}

describe('wormholeCurvePoint', () => {
  it('starts at one cluster, ends at the other and arcs above the chord', () => {
    const from = [0, 0, 0] as const
    const to = [40, 0, 0] as const
    expect(wormholeCurvePoint(from, to, 0)).toEqual([0, 0, 0])
    expect(wormholeCurvePoint(from, to, 1)).toEqual([40, 0, 0])
    const middle = wormholeCurvePoint(from, to, 0.5)
    expect(middle[0]).toBeCloseTo(20, 6)
    expect(middle[1]).toBeGreaterThan(0)
  })

  it('still arcs when the two clusters are stacked vertically', () => {
    const middle = wormholeCurvePoint([0, 0, 0], [0, 40, 0], 0.5)
    expect(Math.hypot(middle[0], middle[2])).toBeGreaterThan(0)
  })
})

describe('OverlayLayer', () => {
  it('builds a wormhole stream and a dark-matter lens as two batches', () => {
    const { layer, scene } = setup()
    const diagnostics = layer.diagnostics()
    expect(diagnostics.wormholePointCount).toBe(WORMHOLE_SAMPLES)
    expect(diagnostics.darkLensCount).toBe(1)
    expect(diagnostics.batchCount).toBe(2)
    expect(scene.meshes.length).toBe(2)
    layer.dispose()
  })

  it('shows the wormhole stream only in wormhole mode', () => {
    const { layer, source } = setup()
    layer.setMode('all', source, 0)
    expect(layer.diagnostics().wormholeVisible).toBe(false)
    layer.setMode('worm', source, 0)
    expect(layer.diagnostics().wormholeVisible).toBe(true)
    expect(layer.diagnostics().activeWormhole).toBe(0)
    layer.setMode('dark', source, 0)
    expect(layer.diagnostics().wormholeVisible).toBe(false)
    layer.dispose()
  })

  it('keeps dark matter resident and lifts it only in its own mode', () => {
    const { layer, source } = setup()
    layer.setMode('all', source, 0)
    const resident = layer.diagnostics().darkEmphasis
    expect(resident).toBeGreaterThan(0)
    expect(resident).toBeLessThan(1)
    layer.setMode('dark', source, 0)
    expect(layer.diagnostics().darkEmphasis).toBeCloseTo(1, 6)
    expect(layer.diagnostics().darkVisible).toBe(true)
    layer.dispose()
  })

  it('thins the stream with quality but never removes the layer', () => {
    const counts = QUALITY_LEVELS.map((quality) => {
      const { layer } = setup(quality)
      const diagnostics = layer.diagnostics()
      expect(diagnostics.batchCount).toBe(2)
      expect(diagnostics.wormholePointCount).toBeGreaterThan(0)
      expect(diagnostics.darkLensCount).toBe(1)
      layer.dispose()
      return diagnostics.wormholePointCount
    })
    expect(counts[0]).toBeGreaterThan(counts[2]!)
  })

  it('recesses overlays owned by clusters the viewer is not focused on', () => {
    const { layer, source } = setup()
    layer.setMode('worm', source, 0)
    layer.setFocus({ c: 'a1', g: 0 } as never)
    const focus = layer.diagnostics().wormholeFocus
    expect(Math.max(...focus)).toBeCloseTo(1, 6)
    expect(Math.min(...focus)).toBeCloseTo(0.12, 6)
    layer.setFocus(null)
    expect(Math.min(...layer.diagnostics().wormholeFocus)).toBeCloseTo(1, 6)
    layer.dispose()
  })

  it('releases every mesh, material and geometry it created', () => {
    const { scene, layer } = setup()
    layer.dispose()
    expect(scene.meshes.length).toBe(0)
    expect(scene.materials.length).toBe(0)
    expect(() => layer.dispose()).not.toThrow()
  })
})

describe('wormholePointSize', () => {
  it('caps the sprite so a close panorama camera cannot flood the frame', () => {
    // Three parks the panorama camera at sceneRadius * 1.62 where 1/z keeps these
    // sprites a few pixels wide. This renderer frames the panorama much closer,
    // so the same formula grows them to hundreds of pixels without a ceiling —
    // exactly the failure Three guards against for dust.
    expect(wormholePointSize(1, 1000, 4)).toBe(WORMHOLE_MAX_POINT_PX)
    expect(wormholePointSize(0, 500, 400)).toBeGreaterThanOrEqual(1)
    expect(wormholePointSize(0.5, 500, 200)).toBeLessThanOrEqual(WORMHOLE_MAX_POINT_PX)
    expect(WORMHOLE_MAX_POINT_PX).toBeLessThanOrEqual(12)
  })

  it('still grows with the pulse when there is room', () => {
    expect(wormholePointSize(1, 200, 200)).toBeGreaterThan(wormholePointSize(0, 200, 200))
  })
})
