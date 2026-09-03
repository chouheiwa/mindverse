import { Constants } from '@babylonjs/core/Engines/constants.js'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Geometry } from '@babylonjs/core/Meshes/geometry.js'
import { Material } from '@babylonjs/core/Materials/material.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Scene } from '@babylonjs/core/scene.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
  const compile: StellarCompilePort = (_kind, _targets, succeed) => succeed()
  const layer = new StarLayer(scene, stars, 'high', false, { compile, ...options })
  return { engine, scene, stars, layer }
}

afterEach(() => vi.restoreAllMocks())

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

  it('uses additive alpha while only the occluding core preserves depth writes', () => {
    const { layer, scene } = setup()
    const materials = ['core', 'halo', 'flare'].map((name) =>
      scene.getMaterialByName(`stellar:panorama:${name}:material`))
    expect(materials.every((material) => material instanceof ShaderMaterial)).toBe(true)
    expect(materials.map((material) => material?.needAlphaBlending())).toEqual([true, true, true])
    expect(materials.map((material) => material?.alphaMode)).toEqual([
      Constants.ALPHA_ADD, Constants.ALPHA_ADD, Constants.ALPHA_ADD,
    ])
    expect(materials.map((material) => material?.disableDepthWrite)).toEqual([false, true, true])
    layer.dispose()
  })

  it('writes focused surface depth only after the surface handoff becomes opaque', () => {
    const { layer, scene, stars } = setup(1)
    const surface = scene.getMeshByName('stellar:focus:surface')!.material!
    const corona = scene.getMeshByName('stellar:focus:corona')!.material!
    layer.setFocus('s-0', stars[0]!)
    layer.setPresentation(describeStarPresentation({ phase: 'approach', approachProgress: 0.5 }), null, null)
    expect(surface.disableDepthWrite).toBe(true)
    expect(corona.disableDepthWrite).toBe(true)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)
    expect(surface.disableDepthWrite).toBe(false)
    expect(corona.disableDepthWrite).toBe(true)
    layer.dispose()
  })

  it.each([
    ['high', 48, 4, 2, 5151], ['medium', 32, 3, 2, 2415], ['low', 20, 2, 1, 1035],
  ] as const)('uses exact %s quality configuration', (
    quality, sphereSegments, noiseOctaves, coronaLayers, sphereVertices,
  ) => {
    const setFloat = vi.spyOn(ShaderMaterial.prototype, 'setFloat')
    const engine = new NullEngine(); const scene = new Scene(engine)
    const star = datum(0)
    const layer = new StarLayer(scene, [star], quality, false)
    const sphere = scene.getMeshByName('stellar:focus:surface')!
    const surface = sphere.material as ShaderMaterial
    const corona = scene.getMeshByName('stellar:focus:corona')!.material as ShaderMaterial
    layer.setFocus('s-0', star)
    expect(layer.diagnostics().quality).toEqual({ sphereSegments, noiseOctaves, coronaLayers })
    expect(sphere.getTotalVertices()).toBe(sphereVertices)
    expect(surface.options.defines).toContain(`#define STAR_NOISE_OCTAVES ${noiseOctaves}`)
    expect(setFloat.mock.calls.some((call, index) =>
      setFloat.mock.contexts[index] === corona
      && call[0] === 'uCoronaLayers' && call[1] === coronaLayers)).toBe(true)
    layer.dispose(); scene.dispose(); engine.dispose()
  })

  it('reuses one focused sphere and corona while updating stellar uniforms', () => {
    const setFloat = vi.spyOn(ShaderMaterial.prototype, 'setFloat')
    const { layer, scene, stars } = setup()
    const sphere = scene.getMeshByName('stellar:focus:surface')!
    const corona = scene.getMeshByName('stellar:focus:corona')!
    const surfaceMaterial = sphere.material as ShaderMaterial
    expect(surfaceMaterial.backFaceCulling).toBe(true)
    expect((corona.material as ShaderMaterial).backFaceCulling).toBe(false)
    setFloat.mockClear()
    layer.setFocus('s-0', stars[0]!)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)
    layer.update({ elapsedMs: 2000, renderHeight: 900, devicePixelRatio: 2, projectionScale: 720 })
    const first = layer.diagnostics()
    expect(first.focusedPairCount).toBe(1)
    expect(first.focusedVisible).toBe(true)
    expect(first.focusUniforms).toMatchObject({ kelvin: 4200, rot: 0.17, activity: 0, time: 2000 })
    const firstWrites = setFloat.mock.calls.filter((_call, index) =>
      setFloat.mock.contexts[index] === surfaceMaterial)
    expect(firstWrites).toEqual(expect.arrayContaining([
      ['uKelvin', 4200], ['uSeed', 11], ['uRot', 0.17], ['uActivity', 0], ['uTime', 2000],
    ]))

    layer.setFocus('s-1', stars[1]!)
    layer.update({ elapsedMs: 3000, renderHeight: 900, devicePixelRatio: 2, projectionScale: 720 })
    expect(layer.diagnostics().focusUniforms).toMatchObject({ kelvin: 4300, rot: 1.17, time: 3000 })
    expect(scene.getMeshByName('stellar:focus:surface')).toBe(sphere)
    expect(scene.getMeshByName('stellar:focus:corona')).toBe(corona)
    expect(sphere.material).toBe(surfaceMaterial)
    expect(scene.meshes.filter((mesh) => mesh.name.startsWith('stellar:focus:'))).toHaveLength(2)
    layer.dispose()
  })

  it('updates the shared mutable dimension buffer without rebuilding resources', () => {
    const { layer, scene } = setup()
    const batches = ['core', 'halo', 'flare'].map((name) =>
      scene.getMeshByName(`stellar:panorama:${name}`)!)
    const sharedGeometry = batches[0]!.geometry
    expect(batches.every((mesh) => mesh.geometry === sharedGeometry)).toBe(true)
    const before = layer.diagnostics()
    layer.setDimensions([0.2, 0.4, 0.6])
    const after = layer.diagnostics()
    expect(after.panoramaMeshIds).toEqual(before.panoramaMeshIds)
    expect(after.panoramaMaterialIds).toEqual(before.panoramaMaterialIds)
    expect(after.dimensions[0]).toBeCloseTo(0.2)
    expect(after.dimensions[1]).toBeCloseTo(0.4)
    expect(after.dimensions[2]).toBeCloseTo(0.6)
    expect(batches.every((mesh) => mesh.geometry === sharedGeometry)).toBe(true)
    for (const mesh of batches) {
      expect(Array.from(mesh.getVerticesData('aDim') ?? [])).toEqual([
        expect.closeTo(0.2), expect.closeTo(0.4), expect.closeTo(0.6),
      ])
    }
    layer.dispose()
  })

  it('requires one base dimension per stable star', () => {
    const { layer } = setup()
    expect(() => layer.setDimensions([0.2, 0.4])).toThrow(RangeError)
    expect(layer.diagnostics().dimensions).toEqual([1, 1, 1])
    layer.dispose()
  })

  it('hands off only the focused point while retaining dim nonfocused points', () => {
    const { layer, scene, stars } = setup()
    layer.setDimensions([0.5, 1, 0.25])
    layer.setFocus('s-0', stars[0]!)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)
    const core = scene.getMeshByName('stellar:panorama:core')!
    const halo = scene.getMeshByName('stellar:panorama:halo')!
    expect(Array.from(core.getVerticesData('aCoreDim') ?? [])).toEqual([
      expect.closeTo(0), expect.closeTo(0.18), expect.closeTo(0.045),
    ])
    expect(Array.from(halo.getVerticesData('aHaloDim') ?? [])).toEqual([
      expect.closeTo(0), expect.closeTo(0.18), expect.closeTo(0.045),
    ])

    layer.setPresentation(describeStarPresentation({ phase: 'strata' }), null, null)
    expect(Array.from(core.getVerticesData('aCoreDim') ?? [])).toEqual([0, 0, 0])
    expect(Array.from(halo.getVerticesData('aHaloDim') ?? [])).toEqual([0, 0, 0])
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
    const setFloat = vi.spyOn(ShaderMaterial.prototype, 'setFloat')
    const engine = new NullEngine(); const scene = new Scene(engine); const star = datum(0)
    const layer = new StarLayer(scene, [star], 'low', true)
    const surface = scene.getMeshByName('stellar:focus:surface')!.material as ShaderMaterial
    setFloat.mockClear()
    layer.setFocus('one', star)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)
    layer.update({ elapsedMs: 1000, renderHeight: 500, devicePixelRatio: 1, projectionScale: 400 })
    layer.update({ elapsedMs: 9000, renderHeight: 500, devicePixelRatio: 1, projectionScale: 400 })
    expect(layer.diagnostics().focusUniforms).toMatchObject({ time: 0, seed: 11, kelvin: 4200 })
    expect(setFloat.mock.calls.filter((_call, index) => setFloat.mock.contexts[index] === surface))
      .toEqual(expect.arrayContaining([['uTime', 0]]))
    layer.dispose(); scene.dispose(); engine.dispose()
  })

  it('applies live Reduced Motion changes immediately in both directions', () => {
    const setFloat = vi.spyOn(ShaderMaterial.prototype, 'setFloat')
    const { layer, scene, stars } = setup(1)
    const sphere = scene.getMeshByName('stellar:focus:surface')!
    layer.setFocus('s-0', stars[0]!)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)
    layer.update({ elapsedMs: 2400, renderHeight: 500, devicePixelRatio: 1, projectionScale: 400 })
    const animated = sphere.position.clone()
    const activity = layer.diagnostics().focusUniforms.activity
    setFloat.mockClear()

    layer.setReducedMotion(true)
    expect(layer.diagnostics().focusUniforms).toMatchObject({ time: 0, activity })
    expect(sphere.position.asArray()).not.toEqual(animated.asArray())
    expect(setFloat.mock.calls).toContainEqual(['uBobAmplitude', 0])

    setFloat.mockClear()
    layer.setReducedMotion(false)
    expect(layer.diagnostics().focusUniforms).toMatchObject({ time: 2400, activity })
    expect(sphere.position.asArray()).toEqual(animated.asArray())
    expect(setFloat.mock.calls).toContainEqual(['uBobAmplitude', 1.35])
    layer.dispose()
  })

  it('skips stable presentation, interaction, and focus buffer uploads', () => {
    const updateVerticesData = vi.spyOn(Geometry.prototype, 'updateVerticesData')
    const { layer, stars } = setup(2)
    const presentation = describeStarPresentation({ phase: 'star-focus' })
    layer.setFocus('s-0', stars[0]!)
    layer.setPresentation(presentation, null, null)
    updateVerticesData.mockClear()

    layer.setFocus('s-0', stars[0]!)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)

    expect(updateVerticesData.mock.calls.filter(([kind]) =>
      kind === 'aCoreDim' || kind === 'aHaloDim' || kind === 'aInteraction')).toEqual([])
    layer.dispose()
  })

  it('retains sanitized static activity in Reduced Motion panorama buffers', () => {
    const engine = new NullEngine(); const scene = new Scene(engine)
    const star = datum(0); star.burst = 0.64
    const layer = new StarLayer(scene, [star], 'low', true, {
      compile: (_kind, _targets, succeed) => succeed(),
    })
    const core = scene.getMeshByName('stellar:panorama:core')!
    expect(Array.from(core.getVerticesData('aBurst') ?? [])).toEqual([expect.closeTo(0.64)])
    layer.dispose(); scene.dispose(); engine.dispose()
  })

  it('uploads only finite descriptor-derived panorama attributes', () => {
    const invalid = datum(0)
    invalid.p = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    invalid.center = [Number.NaN, 2, Number.POSITIVE_INFINITY]
    invalid.axis = [Number.NaN, 0, 0]
    invalid.period = Number.NaN
    invalid.pointSize = Number.POSITIVE_INFINITY
    invalid.bodyR = Number.NaN
    invalid.bright = Number.POSITIVE_INFINITY
    invalid.burst = Number.NaN
    invalid.seed = Number.NEGATIVE_INFINITY
    invalid.rot = Number.NaN
    invalid.color = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]
    const engine = new NullEngine(); const scene = new Scene(engine)
    const layer = new StarLayer(scene, [invalid], 'high', false, {
      compile: (_kind, _targets, succeed) => succeed(),
    })
    const core = scene.getMeshByName('stellar:panorama:core')!
    for (const kind of [
      'position', 'aCenter', 'aAxis', 'aColor', 'aPeriod', 'aCoreSize', 'aHaloSize',
      'aBright', 'aBurst', 'aSeed', 'aRot', 'aBodyR', 'aDim', 'aCoreDim', 'aHaloDim',
      'aInteraction',
    ]) {
      expect(Array.from(core.getVerticesData(kind) ?? []).every(Number.isFinite), kind).toBe(true)
    }
    expect(Array.from(core.getVerticesData('aColor') ?? [])).toEqual([1, 1, 1])
    expect(Array.from(core.getVerticesData('aBright') ?? [])).toEqual([expect.closeTo(1.8186, 3)])
    expect(Array.from(core.getVerticesData('aSeed') ?? [])).toEqual([1])
    expect(Array.from(core.getVerticesData('aBurst') ?? [])).toEqual([0])
    layer.dispose(); scene.dispose(); engine.dispose()
  })

  it('substitutes fallback materials without a renderer-fatal error', async () => {
    const dispose = vi.spyOn(ShaderMaterial.prototype, 'dispose')
    const setFloat = vi.spyOn(ShaderMaterial.prototype, 'setFloat')
    const setColor3 = vi.spyOn(ShaderMaterial.prototype, 'setColor3')
    let advanced: readonly Material[] = []
    let fallback: readonly Material[] = []
    const compile: StellarCompilePort = (kind, targets, succeed, fail) => {
      const materials = targets.map(({ material }) => material)
      if (kind === 'advanced') { advanced = materials; fail(new Error('advanced compile failed')) }
      else { fallback = materials; succeed() }
    }
    const onError = vi.fn()
    const { layer, scene, stars } = setup(1, { compile, onError })
    const sphere = scene.getMeshByName('stellar:focus:surface')!
    const corona = scene.getMeshByName('stellar:focus:corona')!
    layer.setFocus('s-0', stars[0]!)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)
    await vi.waitFor(() => expect(layer.diagnostics().stellarShaderFallback).toBe(true))
    expect(layer.diagnostics()).toMatchObject({ stellarShaderFallback: true, focusedPairCount: 1 })
    expect(fallback).toHaveLength(2)
    expect(fallback.every((material) => material instanceof ShaderMaterial)).toBe(true)
    expect(fallback.every((material) => typeof material.onError === 'function')).toBe(true)
    expect(sphere.material).toBe(fallback[0])
    expect(corona.material).toBe(fallback[1])
    expect(fallback.map(({ alphaMode }) => alphaMode)).toEqual([
      Constants.ALPHA_COMBINE, Constants.ALPHA_ADD,
    ])
    expect(fallback.map(({ disableDepthWrite }) => disableDepthWrite)).toEqual([false, true])
    expect((fallback[0] as ShaderMaterial).backFaceCulling).toBe(true)
    expect((fallback[1] as ShaderMaterial).backFaceCulling).toBe(false)
    expect(sphere.isEnabled()).toBe(true)
    expect(corona.isEnabled()).toBe(true)
    expect(dispose.mock.contexts).toEqual(expect.arrayContaining(advanced as ShaderMaterial[]))
    const fallbackFloatWrites = setFloat.mock.calls.filter((_call, index) =>
      fallback.includes(setFloat.mock.contexts[index] as Material))
    expect(fallbackFloatWrites).toEqual(expect.arrayContaining([
      ['uSurfaceAlpha', 1], ['uCoronaAlpha', 1], ['uCoronaIntensity', 1],
    ]))
    expect(setColor3.mock.contexts.some((context) => fallback.includes(context as Material))).toBe(true)
    expect(onError).not.toHaveBeenCalled()
    layer.dispose()
  })

  it('does not enable focused visuals before compile success is known', () => {
    let compiled: (() => void) | undefined
    const compile: StellarCompilePort = (kind, _targets, succeed) => {
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

  it('compiles each focused material against its matching mesh by default', async () => {
    const forceCompilation = vi.spyOn(Material.prototype, 'forceCompilationAsync').mockResolvedValue()
    const engine = new NullEngine(); const scene = new Scene(engine); const star = datum(0)
    const layer = new StarLayer(scene, [star], 'high', false)
    const sphere = scene.getMeshByName('stellar:focus:surface')!
    const corona = scene.getMeshByName('stellar:focus:corona')!
    layer.setFocus('s-0', star)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)
    expect(layer.diagnostics().focusedReady).toBe(false)
    await vi.waitFor(() => expect(layer.diagnostics().focusedReady).toBe(true))
    expect(forceCompilation.mock.calls).toEqual([[sphere], [corona]])
    expect(forceCompilation.mock.contexts).toEqual([sphere.material, corona.material])
    layer.dispose(); scene.dispose(); engine.dispose()
  })

  it('ignores stale compile callbacks after replacement and disposal', async () => {
    let advancedSucceed: (() => void) | undefined
    let advancedFail: ((cause: Error) => void) | undefined
    let fallbackSucceed: (() => void) | undefined
    let fallbackFail: ((cause: Error) => void) | undefined
    const compile: StellarCompilePort = (kind, _targets, succeed, fail) => {
      if (kind === 'advanced') { advancedSucceed = succeed; advancedFail = fail }
      else { fallbackSucceed = succeed; fallbackFail = fail }
    }
    const { layer, stars } = setup(1, { compile })
    layer.setFocus('s-0', stars[0]!)
    layer.setPresentation(describeStarPresentation({ phase: 'star-focus' }), null, null)
    advancedFail?.(new Error('advanced'))
    await vi.waitFor(() => expect(fallbackSucceed).toBeTypeOf('function'))
    advancedSucceed?.()
    expect(layer.diagnostics()).toMatchObject({ focusedReady: false, stellarShaderFallback: false })
    fallbackSucceed?.()
    expect(layer.diagnostics()).toMatchObject({ focusedReady: true, stellarShaderFallback: true })
    advancedFail?.(new Error('stale advanced failure'))
    fallbackFail?.(new Error('stale fallback failure'))
    expect(layer.diagnostics()).toMatchObject({ focusedReady: true, stellarShaderFallback: true })
    layer.dispose()
    fallbackSucceed?.()
    fallbackFail?.(new Error('disposed fallback failure'))
    advancedSucceed?.()
    expect(layer.diagnostics()).toMatchObject({ focusedReady: false, disposed: true })
  })

  it('reports a frozen original advanced error only when fallback compilation also fails', async () => {
    const advancedFailure = Object.freeze(new Error('advanced compile failed'))
    const fallbackFailure = new Error('fallback compile failed')
    const compile: StellarCompilePort = (kind, _targets, _succeed, fail) =>
      fail(kind === 'advanced' ? advancedFailure : fallbackFailure)
    const onError = vi.fn()
    const { layer } = setup(1, { compile, onError })
    await vi.waitFor(() => expect(onError).toHaveBeenCalledOnce())
    expect(layer.diagnostics()).toMatchObject({ focusedReady: false, stellarShaderFallback: false })
    expect(onError).toHaveBeenCalledWith(advancedFailure)
    layer.dispose(); layer.dispose()
    expect(layer.diagnostics().disposed).toBe(true)
  })
})
