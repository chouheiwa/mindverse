import { afterEach, describe, expect, it } from 'vitest'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { layoutSurfaceMarks } from './surfaceMarks'
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


describe('surface mark visibility', () => {
  it.each([0.18, 0.3, 2])('projects the nearest flag above 40 pixels at radius %s', (radius) => {
    const engine = new NullEngine()
    const scene = new Scene(engine)
    const root = new TransformNode('root', scene)
    const placements = layoutSurfaceMarks([0, 1, 0], [0, 0, 1], [
      { answerId: 'front', kind: 'flag' }, { answerId: 'near', kind: 'flag' },
    ])
    const marks = new PlanetSurfaceMarks(scene, root, { field, radius, displacement: 0, placements })
    cleanup.push(() => { marks.dispose(); scene.dispose(); engine.dispose() })
    const nearest = [...placements].sort((a, b) => b.direction[1] - a.direction[1])[0]!
    const pole = marks.pickableMeshes().find((mesh) => marks.answerIdOf(mesh.uniqueId) === nearest.answerId && mesh.name.endsWith(':pole'))!
    const height = pole.getBoundingInfo().boundingBox.extendSize.y * 2
    const angle = Math.acos(nearest.direction[1])
    // 水平朝向标记：z = (R+h)sinθ，y = (R+h)cosθ−1.012R，像素 y = fy/z。
    const focal = 720 / (2 * Math.tan(Math.PI / 6))
    const projected = (h: number) => focal * ((radius + h) * Math.cos(angle) - radius * 1.012) / ((radius + h) * Math.sin(angle))
    // 双边窗口：下界防止标记小到看不见，上界防止标记大到挡住地表——单边下限曾让 0.032R 的旗杆
    // 投影到 587px（几乎铺满 720px 视口）仍然绿灯。
    const poleSpan = projected(height) - projected(0)
    expect(poleSpan).toBeGreaterThanOrEqual(60)
    expect(poleSpan).toBeLessThanOrEqual(220)
    const cloth = marks.pickableMeshes().find((mesh) => mesh.name.endsWith(':banner'))!
    const clothSpan = projected(cloth.getBoundingInfo().boundingBox.extendSize.y * 2) - projected(0)
    expect(clothSpan).toBeGreaterThanOrEqual(24)
    expect(clothSpan).toBeLessThanOrEqual(100)
  })

  it('builds unequal non-collinear stones and grounds every mark', () => {
    const { marks } = setup()
    const stones = marks.pickableMeshes().filter((mesh) => mesh.name.includes(':stone:'))
    expect(stones.length).toBeGreaterThanOrEqual(3)
    const radii = stones.map((mesh) => mesh.getBoundingInfo().boundingBox.extendSize.y)
    expect(new Set(radii.map((radius) => radius.toFixed(8))).size).toBe(stones.length)
    const centers = stones.map((mesh) => mesh.position)
    expect(Vector3.Cross(centers[1]!.subtract(centers[0]!), centers[2]!.subtract(centers[0]!)).length()).toBeGreaterThan(1e-8)
    for (const id of marks.answerIds()) {
      const anchor = marks.anchorOf(id)!
      const direction = anchor.normalizeToNew()
      expect(anchor.length()).toBeCloseTo(0.3 * (1 + field.height([direction.x, direction.y, direction.z]) * 0.05), 8)
    }
    const pole = marks.pickableMeshes().find((mesh) => mesh.name.endsWith(':pole'))!
    expect(pole.position.y - pole.getBoundingInfo().boundingBox.extendSize.y).toBeCloseTo(0, 9)
    // 石堆底石直接接触锚点的地面，上层石头由底石承托。
    expect(stones[0]!.position.y - radii[0]!).toBeCloseTo(0, 9)
  })
})
