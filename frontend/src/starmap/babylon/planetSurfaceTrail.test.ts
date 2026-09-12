import { afterEach, describe, expect, it } from 'vitest'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { PlanetSurfaceTrail } from './planetSurfaceTrail'
import { layoutSurfaceTrail } from './surfaceTrail'
import { createTerrainField } from './terrainField'

const cleanup: (() => void)[] = []
afterEach(() => { cleanup.splice(0).forEach((dispose) => dispose()) })
const field = createTerrainField({
  seed: 7, octaves: 3, warpStrength: 0.1, faultStrength: 0.3, detailDensity: 0.4,
  largeCraters: [], qualityLevel: 1, smallCraterThreshold: 0.7,
})

describe('PlanetSurfaceTrail', () => {
  it('lays footprints on the terrain and plants a pickable signpost at the end', () => {
    const engine = new NullEngine()
    const scene = new Scene(engine)
    const root = new TransformNode('planet-surface-root', scene)
    const layout = layoutSurfaceTrail([0, 1, 0], [0.4, 0.8, 0.4])
    const trail = new PlanetSurfaceTrail(scene, root, { field, radius: 0.3, displacement: 0.05, layout })
    cleanup.push(() => { trail.dispose(); scene.dispose(); engine.dispose() })
    expect(trail.diagnostics()).toEqual({ stepCount: layout.steps.length, signpost: true })
    const signpost = trail.signpost()!
    const expected = 0.3 * (1 + field.height(layout.signpost) * 0.05)
    expect(signpost.length()).toBeCloseTo(expected, 6)
    const pickable = scene.meshes.filter((mesh) => mesh.isPickable)
    expect(pickable.length).toBe(2)
    for (const mesh of pickable) expect(trail.isSignpostMesh(mesh.uniqueId)).toBe(true)
    trail.dispose()
    expect(scene.meshes).toHaveLength(0)
    expect(trail.diagnostics()).toEqual({ stepCount: 0, signpost: false })
  })
})
