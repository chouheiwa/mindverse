import { afterEach, describe, expect, it } from 'vitest'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { PlanetSurfaceMarks } from './planetSurfaceMarks'
import { createTerrainField } from './terrainField'

const cleanup: (() => void)[] = []
afterEach(() => { cleanup.splice(0).forEach((dispose) => dispose()) })
const field = createTerrainField({
  seed: 7, octaves: 3, warpStrength: 0.1, faultStrength: 0.3, detailDensity: 0.4,
  largeCraters: [], qualityLevel: 1, smallCraterThreshold: 0.7,
})
function setup() {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const root = new TransformNode('planet-surface-root', scene)
  const marks = new PlanetSurfaceMarks(scene, root, {
    field, radius: 0.3, displacement: 0.05,
    placements: [
      { answerId: 'answer:1', kind: 'flag', direction: [0, 1, 0] },
      { answerId: 'answer:2', kind: 'cairn', direction: [0.1, 0.99, 0] },
    ],
  })
  cleanup.push(() => { marks.dispose(); scene.dispose(); engine.dispose() })
  return { scene, root, marks }
}

describe('PlanetSurfaceMarks', () => {
  it('plants one pickable body per mark on the terrain, under the surface root', () => {
    const { root, marks } = setup()
    expect(marks.diagnostics().markCount).toBe(2)
    const pickable = marks.pickableMeshes()
    expect(pickable.length).toBeGreaterThanOrEqual(2)
    for (const mesh of pickable) {
      expect(mesh.isPickable).toBe(true)
      expect(mesh.parent === root || mesh.parent?.parent === root).toBe(true)
      expect(marks.answerIdOf(mesh.uniqueId)).toMatch(/^answer:/)
    }
    // 旗插在地形高度上：到星心的距离 = R·(1 + h·displacement)，不是埋进去也不是悬空。
    const flag = marks.anchorOf('answer:1')!
    const expected = 0.3 * (1 + field.height([0, 1, 0]) * 0.05)
    expect(Math.hypot(flag.x, flag.y, flag.z)).toBeCloseTo(expected, 6)
  })

  it('reports nothing for a foreign mesh and cleans up after itself', () => {
    const { scene, marks } = setup()
    expect(marks.answerIdOf(-1)).toBeNull()
    const before = scene.meshes.length
    expect(before).toBeGreaterThan(0)
    marks.dispose()
    expect(scene.meshes).toHaveLength(0)
    expect(marks.diagnostics().markCount).toBe(0)
    expect(() => marks.dispose()).not.toThrow()
  })
})
