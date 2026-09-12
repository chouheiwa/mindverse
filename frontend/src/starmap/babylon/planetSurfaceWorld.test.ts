import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { Scene } from '@babylonjs/core/scene.js'
import { afterEach, describe, expect, it } from 'vitest'
import type { Vec3 } from './cubeSphere'
import { createTerrainField } from './terrainField'
import { faceDirection } from './cubeSphere'
import { DEFAULT_BUILD_BUDGET_PER_UPDATE, PlanetSurfaceWorld } from './planetSurfaceWorld'

const engines: NullEngine[] = []
afterEach(() => { for (const engine of engines.splice(0)) engine.dispose() })

// 既有用例写在「一次 update 建完」的语义上，夹具默认给足预算保留它们；
// 分帧建块由下面几条新用例显式传小预算来驱动。
function setup(buildBudgetPerUpdate = 100_000) {
  const engine = new NullEngine()
  engines.push(engine)
  const scene = new Scene(engine)
  const parent = new TransformNode('planet', scene)
  const field = createTerrainField({
    seed: 42, octaves: 1, warpStrength: 0, faultStrength: 0,
    detailDensity: 1, largeCraters: [], qualityLevel: 0, smallCraterThreshold: 0.5,
  })
  const world = new PlanetSurfaceWorld(scene, parent, {
    field, radius: 10, displacement: 0.1, resolution: 2, skirtDepth: 0.01,
    maxDepth: 5, detailAngle: 0.35, budget: 400,
    buildBudgetPerUpdate,
  })
  return { scene, parent, world }
}

const up: Vec3 = [0, 1, 0]
const ownedMeshes = (scene: Scene, parent: TransformNode) =>
  scene.meshes.filter((mesh) => mesh.parent === parent)

describe('PlanetSurfaceWorld', () => {
  it('reuses the actual meshes and geometry when the camera stays still', () => {
    const { scene, parent, world } = setup()
    expect(world.diagnostics().meshCount).toBe(0)
    world.update(up, 6)
    const meshes = ownedMeshes(scene, parent)
    const geometries = meshes.map((mesh) => mesh.geometry)
    expect(meshes.length).toBeGreaterThanOrEqual(6)
    expect(world.diagnostics().builtThisUpdate).toBe(meshes.length)
    world.update(up, 6)
    expect(world.diagnostics()).toEqual({
      chunkCount: meshes.length, meshCount: meshes.length,
      builtThisUpdate: 0, disposedThisUpdate: 0, vertexCount: meshes.length * 17,
      pendingCount: 0, ready: true,
    })
    ownedMeshes(scene, parent).forEach((mesh, index) => {
      expect(mesh).toBe(meshes[index])
      expect(mesh.geometry).toBe(geometries[index])
      expect(mesh.name).toMatch(/planet-surface:face=\d+:u=-?[\d.]+:v=-?[\d.]+:depth=\d+/)
    })
  })

  it('adds detail on descent and only replaces changed chunks when moving around the sphere', () => {
    const { scene, parent, world } = setup()
    world.update(up, 6)
    const orbit = world.diagnostics()
    world.update(up, 1.02)
    const ground = world.diagnostics()
    expect(ground.meshCount).toBeGreaterThan(orbit.meshCount * 2)
    expect(ground.vertexCount).toBe(ground.meshCount * 17)
    const before = new Map(ownedMeshes(scene, parent).map((mesh) => [mesh.name, mesh]))
    world.update([0.2, 1, 0], 1.02)
    const after = new Map(ownedMeshes(scene, parent).map((mesh) => [mesh.name, mesh]))
    const retained = [...before.keys()].filter((key) => after.has(key))
    expect(retained.length).toBeGreaterThan(0)
    for (const key of retained) expect(after.get(key)).toBe(before.get(key))
    const removed = [...before.keys()].filter((key) => !after.has(key))
    expect(removed.length).toBeGreaterThan(0)
    for (const key of removed) expect(before.get(key)!.isDisposed()).toBe(true)
    expect(world.diagnostics().builtThisUpdate).toBe(after.size - retained.length)
    expect(world.diagnostics().disposedThisUpdate).toBe(removed.length)
    expect(scene.geometries).toHaveLength(after.size)
    world.update(up, 6)
    expect(world.diagnostics().meshCount).toBe(orbit.meshCount)
  })

  it('releases owned meshes, geometry and material without disposing the parent or other meshes', () => {
    const { scene, parent, world } = setup()
    const other = new Mesh('unrelated', scene)
    world.update(up, 1.02)
    const meshes = ownedMeshes(scene, parent)
    const material = meshes[0]!.material
    world.dispose()
    expect(scene.meshes).toEqual([other])
    expect(scene.geometries).toHaveLength(0)
    expect(scene.materials).not.toContain(material)
    expect(scene.materials).toHaveLength(0)
    expect(parent.isDisposed()).toBe(false)
    expect(meshes.every((mesh) => mesh.isDisposed())).toBe(true)
    expect(() => world.dispose()).not.toThrow()
    world.update(up, 1.02)
    expect(world.diagnostics()).toEqual({
      chunkCount: 0, meshCount: 0, builtThisUpdate: 0, disposedThisUpdate: 0, vertexCount: 0,
      // 已释放：谈不上就绪，也没有欠账。
      pendingCount: 0, ready: false,
    })
    expect(scene.meshes).toEqual([other])
  })

  it('can be disposed before its first update', () => {
    const { scene, world } = setup()
    world.dispose()
    world.dispose()
    expect(scene.meshes).toHaveLength(0)
    expect(scene.materials).toHaveLength(0)
  })

  it.each([
    [[Number.NaN, 0, 0], Number.NaN],
    [[0, 0, 0], 0],
    [[Infinity, 1, 0], -1],
  ] as [Vec3, number][])('survives invalid camera input %j at %s', (direction, radius) => {
    const { scene, parent, world } = setup()
    expect(() => world.update(direction, radius)).not.toThrow()
    expect(world.diagnostics().meshCount).toBeGreaterThanOrEqual(6)
    for (const mesh of ownedMeshes(scene, parent)) {
      expect(mesh.getVerticesData('position')!.every(Number.isFinite)).toBe(true)
    }
    world.update(direction, radius)
    expect(world.diagnostics().builtThisUpdate).toBe(0)
  })

  it('spreads chunk building across frames instead of stalling one', () => {
    // Metal 实测：进入行星那一帧一次建了 303 块，单帧 2086.5ms，其余帧 <= 14.2ms。
    // 每帧限量建，剩下的下一帧接着建 —— 卡顿没了，画面才有得动。
    const { scene, parent, world } = setup(6)
    world.update(up, 1.02)
    expect(world.diagnostics().builtThisUpdate).toBe(6)
    expect(world.diagnostics().pendingCount).toBeGreaterThan(0)
    expect(world.diagnostics().ready).toBe(false)
    expect(ownedMeshes(scene, parent).length).toBe(6)

    // 相机不动，反复 update 直到补齐：pendingCount 单调下降，最终与不限量时一致。
    let previousPending = world.diagnostics().pendingCount
    for (let frame = 0; frame < 200 && !world.diagnostics().ready; frame += 1) {
      world.update(up, 1.02)
      const pending = world.diagnostics().pendingCount
      expect(pending).toBeLessThanOrEqual(previousPending)
      previousPending = pending
    }
    expect(world.diagnostics().ready).toBe(true)
    expect(world.diagnostics().pendingCount).toBe(0)

    const reference = setup(100000)
    reference.world.update(up, 1.02)
    expect(world.diagnostics().chunkCount).toBe(reference.world.diagnostics().chunkCount)
  })

  it('builds what you are looking at first', () => {
    // 缺块期间玩家看到的必须是正前方完整、余光渐次补齐，而不是随机空洞。
    const { scene, parent, world } = setup(4)
    world.update(up, 1.02)
    const centres = ownedMeshes(scene, parent)
      .filter((mesh) => !mesh.name.includes(':skirt'))
      .map((mesh) => {
        const [, face, u, v] = /face=(\d+):u=(-?[\d.]+):v=(-?[\d.]+)/.exec(mesh.name)!
        return faceDirection(Number(face) as 0 | 1 | 2 | 3 | 4 | 5, Number(u), Number(v))
      })
    expect(centres.length).toBeGreaterThan(0)
    // 先建的这几块都在上半球（与相机方向夹角小于 90 度）。
    for (const centre of centres) expect(centre[0] * up[0] + centre[1] * up[1] + centre[2] * up[2]).toBeGreaterThan(0)
  })

  it('falls back to a sane budget instead of never finishing', () => {
    for (const budget of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { world } = setup(budget)
      world.update(up, 1.02)
      expect(world.diagnostics().builtThisUpdate).toBeLessThanOrEqual(DEFAULT_BUILD_BUDGET_PER_UPDATE)
      expect(world.diagnostics().builtThisUpdate).toBeGreaterThan(0)
      for (let frame = 0; frame < 200 && !world.diagnostics().ready; frame += 1) world.update(up, 1.02)
      expect(world.diagnostics().ready).toBe(true)
    }
  })
})
