import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { describe, expect, it } from 'vitest'
import { QUALITY_LEVELS } from '../quality'
import { babylonCinematicEnvironment } from './cinematic'
import { NEBULA_EXPOSURE, NEBULA_SHELLS, NebulaLayer, backgroundRadiusFor } from './nebulaLayer'

const PALETTE = [[0.12, 0.19, 0.66], [0.54, 0.16, 0.6], [0.04, 0.42, 0.48]] as const

function setup(quality: Parameters<typeof babylonCinematicEnvironment>[0] = 'high') {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const layer = new NebulaLayer(scene, {
    radius: 60,
    palette: PALETTE.map((tint) => [...tint] as [number, number, number]),
    environment: babylonCinematicEnvironment(quality),
  })
  return { engine, scene, layer }
}

describe('NebulaLayer', () => {
  it('builds three shells of increasing radius plus one galaxy core', () => {
    const { layer } = setup()
    const diagnostics = layer.diagnostics()
    expect(diagnostics.shellCount).toBe(3)
    expect(diagnostics.coreCount).toBe(1)
    expect(diagnostics.meshCount).toBe(4)
    const radii = diagnostics.shellRadii
    expect(radii[0]).toBeLessThan(radii[1]!)
    expect(radii[1]).toBeLessThan(radii[2]!)
    layer.dispose()
  })

  it('gives every shell its own spin so the three never lock into one pattern', () => {
    const spins = NEBULA_SHELLS.map(({ spin }) => spin)
    expect(new Set(spins).size).toBe(spins.length)
    for (let index = 1; index < spins.length; index += 1) {
      expect(spins[index]!).toBeLessThan(spins[index - 1]!)
    }
  })

  it('draws each shell once, not both faces of the surrounding box', () => {
    // Additive shells seen from inside: rendering front and back faces doubles
    // every pixel of the nebula and washes the panorama flat.
    const { layer } = setup()
    for (const culling of layer.diagnostics().shellBackFaceCulling) expect(culling).toBe(true)
    for (const orientation of layer.diagnostics().shellSideOrientation) {
      expect(orientation, 'shells must keep only the far side').toBe(1)
    }
    layer.dispose()
  })

  it('bakes each shell once into a shared cube texture instead of per-frame noise', () => {
    const { layer } = setup()
    const diagnostics = layer.diagnostics()
    expect(diagnostics.bakedTextureCount).toBe(3)
    expect(diagnostics.perFrameNoise).toBe(false)
    // refreshRate 0 is Babylon's REFRESHRATE_RENDER_ONCE.
    for (const rate of diagnostics.refreshRates) expect(rate).toBe(0)
    layer.dispose()
  })

  it('drives rotation from absolute time so it cannot drift with frame rate', () => {
    const { layer } = setup()
    layer.update(10)
    const first = layer.diagnostics().shellRotations.map((rotation) => rotation[1])
    layer.update(0)
    layer.update(10)
    expect(layer.diagnostics().shellRotations.map((rotation) => rotation[1])).toEqual(first)
    layer.dispose()
  })

  it('retreats as a whole when the camera closes in on a system', () => {
    const { layer } = setup()
    const lit = layer.diagnostics().gains
    layer.setDim(0.25)
    const dimmed = layer.diagnostics().gains
    expect(dimmed).toHaveLength(lit.length)
    for (let index = 0; index < lit.length; index += 1) {
      expect(dimmed[index]!).toBeCloseTo(lit[index]! * 0.25, 6)
    }
    layer.setDim(1)
    expect(layer.diagnostics().gains).toEqual(lit)
    layer.dispose()
  })

  it('scales the Three gains by one visible calibration constant, never by editing them', () => {
    const environment = babylonCinematicEnvironment('high')
    const { layer } = setup('high')
    const gains = layer.diagnostics().gains
    environment.shellGain.forEach((gain, index) => {
      expect(gains[index]!).toBeCloseTo(gain * NEBULA_EXPOSURE, 6)
    })
    expect(gains[3]!).toBeCloseTo(environment.coreGain * NEBULA_EXPOSURE, 6)
    expect(NEBULA_EXPOSURE).toBeGreaterThan(0)
    expect(NEBULA_EXPOSURE).toBeLessThanOrEqual(1)
    layer.dispose()
  })

  it('keeps every layer at every quality and only shrinks the bake', () => {
    const sizes = QUALITY_LEVELS.map((quality) => {
      const { layer } = setup(quality)
      const diagnostics = layer.diagnostics()
      expect(diagnostics.shellCount).toBe(3)
      expect(diagnostics.coreCount).toBe(1)
      for (const gain of diagnostics.gains) expect(gain).toBeGreaterThan(0)
      layer.dispose()
      return diagnostics.bakeSize
    })
    expect(sizes[0]).toBeGreaterThan(sizes[1]!)
    expect(sizes[1]).toBeGreaterThan(sizes[2]!)
  })

  it('releases every mesh, material and texture it created', () => {
    const { scene, layer } = setup()
    const before = {
      meshes: scene.meshes.length, materials: scene.materials.length, textures: scene.textures.length,
    }
    expect(before.meshes).toBeGreaterThanOrEqual(4)
    layer.dispose()
    expect(scene.meshes.length).toBe(0)
    expect(scene.materials.length).toBe(0)
    expect(scene.textures.length).toBe(0)
    expect(() => layer.dispose()).not.toThrow()
  })
})

describe('backgroundRadiusFor', () => {
  it('derives the shell scale from the panorama camera distance, not the star spread', () => {
    // Three parks the panorama camera at sceneRadius * 1.62, so inverting that
    // relation makes the shells and the galaxy core subtend the same angles
    // whatever distance this renderer happens to frame the panorama from.
    expect(backgroundRadiusFor(97.2)).toBeCloseTo(60, 6)
    expect(backgroundRadiusFor(19.2)).toBeCloseTo(19.2 / 1.62, 6)
  })

  it('stays positive and finite for degenerate universes', () => {
    for (const distance of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const radius = backgroundRadiusFor(distance)
      expect(Number.isFinite(radius)).toBe(true)
      expect(radius).toBeGreaterThan(0)
    }
  })
})
