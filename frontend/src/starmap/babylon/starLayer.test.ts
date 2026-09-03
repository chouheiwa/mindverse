import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { describe, expect, it, vi } from 'vitest'
import type { StarDatum } from '../gl/starData'
import { describeStarPresentation } from './starPresentation'
import { StarLayer, type StellarCompilePort } from './starLayer'

function datum(index: number): StarDatum {
  return {
    s: { id: `s-${index}`, c: `star ${index}` },
    p: [index * 2, index * -0.5, -10 - index], center: [0, 0, 0], axis: [0, 1, 0],
    period: 18 + index, start: [0, 0, 0], ignite: 0, pointSize: 4 + index,
    bodyR: 0.5 + index * 0.05, bright: 0.4 + index * 0.2, burst: index / 10,
    seed: 11 + index, rot: 0.17 + index, color: [1, 0.55, 0.2], kelvin: 4200 + index * 100,
    sysAxis: [0, 1, 0], sysU: [1, 0, 0], sysV: [0, 0, 1],
  } as StarDatum
}

function setup(count = 3, options: ConstructorParameters<typeof StarLayer>[4] = {}) {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const stars = Array.from({ length: count }, (_, index) => datum(index))
  const layer = new StarLayer(scene, stars, 'high', false, options)
  return { engine, scene, stars, layer }
}

describe('StarLayer', () => {
  it('uses exactly three shared panorama batches regardless of star count', () => {
    const small = setup(1)
    const large = setup(40)
    expect(small.layer.diagnostics()).toMatchObject({ panoramaBatchCount: 3, panoramaGeometryCount: 1 })
    expect(large.layer.diagnostics()).toMatchObject({ panoramaBatchCount: 3, panoramaGeometryCount: 1 })
    expect(large.scene.meshes.filter((mesh) => mesh.name.startsWith('stellar:panorama:'))).toHaveLength(3)
    expect(large.scene.materials.filter((material) => material.name.startsWith('stellar:panorama:'))).toHaveLength(3)
    expect(large.scene.meshes).toHaveLength(small.scene.meshes.length)
    expect(large.scene.materials).toHaveLength(small.scene.materials.length)
    expect(large.layer.diagnostics().starOrder).toEqual(large.stars.map(({ s }) => 'id' in s ? s.id : s.c))
    expect(large.scene.meshes.every((mesh) => !mesh.isPickable)).toBe(true)
    small.layer.dispose(); small.scene.dispose(); small.engine.dispose()
    large.layer.dispose(); large.scene.dispose(); large.engine.dispose()
  })

  it.each([
    ['high', 48, 4, 2], ['medium', 32, 3, 2], ['low', 20, 2, 1],
  ] as const)('uses exact %s quality configuration', (quality, sphereSegments, noiseOctaves, coronaLayers) => {
    const engine = new NullEngine(); const scene = new Scene(engine)
    const layer = new StarLayer(scene, [datum(0)], quality, false)
    expect(layer.diagnostics().quality).toEqual({ sphereSegments, noiseOctaves, coronaLayers })
    layer.dispose(); scene.dispose(); engine.dispose()
  })

  it('reuses one focused sphere and corona while updating stellar uniforms', () => {
    const { layer, scene, stars } = setup()
    const before = layer.diagnostics().focusedMeshIds
    layer.setFocus('first', stars[0]!)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)
    layer.update({ elapsedMs: 2000, renderHeight: 900, devicePixelRatio: 2, projectionScale: 720 })
    const first = layer.diagnostics()
    expect(first.focusedPairCount).toBe(1)
    expect(first.focusedVisible).toBe(true)
    expect(first.focusUniforms).toMatchObject({ kelvin: 4200, rot: 0.17, time: 2000 })

    layer.setFocus('second', stars[1]!)
    layer.update({ elapsedMs: 3000, renderHeight: 900, devicePixelRatio: 2, projectionScale: 720 })
    expect(layer.diagnostics().focusedMeshIds).toEqual(before)
    expect(layer.diagnostics().focusUniforms).toMatchObject({ kelvin: 4300, rot: 1.17, time: 3000 })
    expect(scene.meshes.filter((mesh) => mesh.name.startsWith('stellar:focus:'))).toHaveLength(2)
    layer.dispose()
  })

  it('updates the shared mutable dimension buffer without rebuilding resources', () => {
    const { layer } = setup()
    const before = layer.diagnostics()
    layer.setDimensions([0.2, 0.4, 0.6])
    const after = layer.diagnostics()
    expect(after.panoramaMeshIds).toEqual(before.panoramaMeshIds)
    expect(after.panoramaMaterialIds).toEqual(before.panoramaMaterialIds)
    expect(after.dimensions[0]).toBeCloseTo(0.2)
    expect(after.dimensions[1]).toBeCloseTo(0.4)
    expect(after.dimensions[2]).toBeCloseTo(0.6)
    layer.dispose()
  })

  it('applies hover and press emphasis only to their addressed stars', () => {
    const { layer } = setup()
    layer.setPresentation(describeStarPresentation({
      phase: 'panorama', hoverProgress: 1, pressedProgress: 1,
    }), 's-1', 's-2')
    expect(layer.diagnostics().interactions).toEqual([
      [1, 1, 1],
      [1.08, 1, 1.25],
      [0.94, 1.12, 1],
    ])
    layer.dispose()
  })

  it('freezes animation time under Reduced Motion while retaining static focus detail', () => {
    const engine = new NullEngine(); const scene = new Scene(engine); const star = datum(0)
    const layer = new StarLayer(scene, [star], 'low', true)
    layer.setFocus('one', star)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)
    layer.update({ elapsedMs: 1000, renderHeight: 500, devicePixelRatio: 1, projectionScale: 400 })
    layer.update({ elapsedMs: 9000, renderHeight: 500, devicePixelRatio: 1, projectionScale: 400 })
    expect(layer.diagnostics().focusUniforms).toMatchObject({ time: 0, seed: 11, kelvin: 4200 })
    layer.dispose(); scene.dispose(); engine.dispose()
  })

  it('substitutes fallback materials without a renderer-fatal error', () => {
    const compile: StellarCompilePort = (kind, _materials, succeed, fail) => kind === 'advanced'
      ? fail(new Error('advanced compile failed')) : succeed()
    const onError = vi.fn()
    const { layer } = setup(1, { compile, onError })
    expect(layer.diagnostics()).toMatchObject({ stellarShaderFallback: true, focusedPairCount: 1 })
    expect(onError).not.toHaveBeenCalled()
    layer.dispose()
  })

  it('does not enable focused visuals before compile success is known', () => {
    let compiled: (() => void) | undefined
    const compile: StellarCompilePort = (kind, _materials, succeed) => {
      if (kind === 'advanced') compiled = succeed
    }
    const { layer, stars } = setup(1, { compile })
    layer.setFocus('s-0', stars[0]!)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)
    expect(layer.diagnostics().focusedVisible).toBe(false)
    compiled?.()
    expect(layer.diagnostics().focusedVisible).toBe(true)
    layer.dispose()
  })

  it('reports an error only when fallback compilation also fails', () => {
    const compile: StellarCompilePort = (_kind, _materials, _succeed, fail) => fail(new Error('compile failed'))
    const onError = vi.fn()
    const { layer } = setup(1, { compile, onError })
    expect(layer.diagnostics().stellarShaderFallback).toBe(true)
    expect(onError).toHaveBeenCalledOnce()
    layer.dispose(); layer.dispose()
    expect(layer.diagnostics().disposed).toBe(true)
  })
})
