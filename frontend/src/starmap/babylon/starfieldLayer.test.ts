import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Scene } from '@babylonjs/core/scene.js'
import { describe, expect, it } from 'vitest'
import { QUALITY_LEVELS } from '../quality'
import { babylonUpliftTier } from './visualUplift'
import { StarfieldLayer, starfieldStrata } from './starfieldLayer'

function setup(quality: Parameters<typeof babylonUpliftTier>[0] = 'high', reducedMotion = false) {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const layer = new StarfieldLayer(scene, { radius: 120, quality, reducedMotion })
  return { engine, scene, layer }
}

describe('starfieldStrata', () => {
  it('splits the budget across three depth shells, nearest sparsest', () => {
    const strata = starfieldStrata(babylonUpliftTier('high'), 120)
    expect(strata).toHaveLength(3)
    const total = strata.reduce((sum, { count }) => sum + count, 0)
    expect(total).toBe(babylonUpliftTier('high').starfieldCount)
    // 视差要读得出来，三层的半径必须真的分开。
    for (let index = 1; index < strata.length; index += 1) {
      expect(strata[index]!.radius).toBeGreaterThan(strata[index - 1]!.radius * 1.2)
    }
    // 远的那一层最密、最暗：那是「深」的来源，不是主角。
    expect(strata.at(-1)!.count).toBeGreaterThan(strata[0]!.count)
    expect(strata.at(-1)!.alpha).toBeLessThan(strata[0]!.alpha)
  })

  it('keeps every shell populated at every quality tier', () => {
    for (const quality of QUALITY_LEVELS) {
      const strata = starfieldStrata(babylonUpliftTier(quality), 90)
      expect(strata).toHaveLength(3)
      for (const stratum of strata) expect(stratum.count).toBeGreaterThan(0)
    }
  })

  it('holds peak alpha under the tier ceiling so the field never washes out', () => {
    for (const quality of QUALITY_LEVELS) {
      const tier = babylonUpliftTier(quality)
      for (const stratum of starfieldStrata(tier, 90)) {
        expect(stratum.alpha).toBeLessThanOrEqual(tier.starfieldPeakAlpha)
      }
    }
  })

  it('sits outside the scene it backs so it never intersects the clusters', () => {
    const strata = starfieldStrata(babylonUpliftTier('high'), 60)
    for (const stratum of strata) expect(stratum.radius).toBeGreaterThan(60)
  })
})

describe('StarfieldLayer', () => {
  it('draws the whole field in one batch per depth shell', () => {
    const { layer, scene, engine } = setup()
    const diagnostics = layer.diagnostics()
    expect(diagnostics.batchCount).toBe(3)
    expect(diagnostics.pointCount).toBe(babylonUpliftTier('high').starfieldCount)
    expect(scene.meshes.filter(({ name }) => name.startsWith('starfield:'))).toHaveLength(3)
    layer.dispose(); scene.dispose(); engine.dispose()
  })

  it('varies colour temperature instead of painting every point white', () => {
    const { layer, scene, engine } = setup()
    const { colourSpread } = layer.diagnostics()
    // 一片纯白的点阵是廉价星空；真实星场是蓝白到橙红的一条谱带。
    expect(colourSpread).toBeGreaterThan(0.18)
    layer.dispose(); scene.dispose(); engine.dispose()
  })

  it('stops twinkling under reduced motion', () => {
    const still = setup('high', true)
    expect(still.layer.diagnostics().twinkle).toBe(0)
    still.layer.dispose(); still.scene.dispose(); still.engine.dispose()
    const moving = setup('high', false)
    expect(moving.layer.diagnostics().twinkle).toBeGreaterThan(0)
    moving.layer.dispose(); moving.scene.dispose(); moving.engine.dispose()
  })

  it('thins with quality but never drops a shell', () => {
    const counts = QUALITY_LEVELS.map((quality) => {
      const { layer, scene, engine } = setup(quality)
      const diagnostics = layer.diagnostics()
      layer.dispose(); scene.dispose(); engine.dispose()
      return diagnostics
    })
    for (const diagnostics of counts) expect(diagnostics.batchCount).toBe(3)
    expect(counts[0]!.pointCount).toBeGreaterThan(counts[1]!.pointCount)
    expect(counts[1]!.pointCount).toBeGreaterThan(counts[2]!.pointCount)
  })

  it('dims to a floor rather than vanishing when the camera closes in', () => {
    const { layer, scene, engine } = setup()
    layer.setPhaseOpacity(0)
    const materials = scene.materials.filter(
      (material): material is ShaderMaterial => material.name.startsWith('starfield:'),
    )
    expect(materials).toHaveLength(3)
    expect(layer.diagnostics().phaseOpacity).toBeGreaterThan(0)
    layer.dispose(); scene.dispose(); engine.dispose()
  })

  it('releases every mesh, material and geometry it created', () => {
    const { layer, scene, engine } = setup()
    layer.dispose()
    expect(scene.meshes.filter(({ name }) => name.startsWith('starfield:'))).toHaveLength(0)
    expect(scene.materials.filter(({ name }) => name.startsWith('starfield:'))).toHaveLength(0)
    expect(scene.geometries.filter(({ id }) => id.startsWith('starfield:'))).toHaveLength(0)
    expect(layer.diagnostics().disposed).toBe(true)
    scene.dispose(); engine.dispose()
  })

  it('produces the same field for the same inputs', () => {
    const first = setup(); const second = setup()
    expect(first.layer.diagnostics().checksum).toBe(second.layer.diagnostics().checksum)
    for (const { layer, scene, engine } of [first, second]) {
      layer.dispose(); scene.dispose(); engine.dispose()
    }
  })
})
