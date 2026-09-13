import { afterEach, describe, expect, it } from 'vitest'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
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
    // 锚点是横板中心（标签挂在这儿），所以比地面高出一个横板高度。
    const ground = 0.3 * (1 + field.height(layout.signpost) * 0.05)
    const board = scene.meshes.find((mesh) => mesh.name.endsWith(':board'))!
    expect(signpost.length()).toBeCloseTo(ground + board.position.y, 6)
    expect(signpost.normalizeToNew().subtract(Vector3.FromArray(layout.signpost)).length()).toBeLessThan(1e-6)
    const pickable = scene.meshes.filter((mesh) => mesh.isPickable)
    expect(pickable.length).toBe(2)
    for (const mesh of pickable) expect(trail.isSignpostMesh(mesh.uniqueId)).toBe(true)
    trail.dispose()
    expect(scene.meshes).toHaveLength(0)
    expect(trail.diagnostics()).toEqual({ stepCount: 0, signpost: false })
  })
})


it.each([0.18, 0.3, 2])('faces a visible board toward the landing at radius %s', (radius) => {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const root = new TransformNode('root', scene)
  const landing = new Vector3(0.6, 0.8, 0)
  const layout = layoutSurfaceTrail([landing.x, landing.y, landing.z], [1, 0, 1])
  const trail = new PlanetSurfaceTrail(scene, root, { field, radius, displacement: 0.05, layout })
  cleanup.push(() => { trail.dispose(); scene.dispose(); engine.dispose() })
  const board = scene.meshes.find((mesh) => mesh.name.endsWith(':board'))!
  board.computeWorldMatrix(true)
  const up = Vector3.FromArray(layout.signpost)
  const toObserver = landing.subtract(up.scale(Vector3.Dot(landing, up))).normalize()
  const boardNormal = Vector3.TransformNormal(Vector3.Forward(), board.getWorldMatrix()).normalize()
  const alignment = Math.abs(Vector3.Dot(boardNormal, toObserver))
  expect(alignment).toBeGreaterThan(0.999)
  const width = board.getBoundingInfo().boundingBox.extendSize.x * 2
  const angle = Math.acos(Vector3.Dot(up, landing))
  const focal = 720 / (2 * Math.tan(Math.PI / 6))
  // 用眼高 0.012R 到横板中心的斜距作保守投影，包含星球曲率与地形高度。
  const eyeRadius = radius * (1 + field.height([landing.x, landing.y, landing.z]) * 0.05 + 0.012)
  // 标签锚点必须落在横板上。锚在杆脚时字掉到板子下方一大截，读成「空白广告牌 + 一行无关的字」。
  const anchor = trail.signpost()!
  const signNode = scene.transformNodes.find((node) => node.name === 'surface-trail:signpost')!
  expect(anchor.subtract(signNode.position).length()).toBeCloseTo(board.position.y, 9)
  const boardRadius = anchor.length()
  const range = Math.hypot(boardRadius * Math.sin(angle), boardRadius * Math.cos(angle) - eyeRadius)
  // 双边窗口。下界要装得下那行标签（实测约 246px 宽），上界防止变成挡住视野的广告牌。
  const boardWidthPx = focal * width * alignment / range
  expect(boardWidthPx).toBeGreaterThanOrEqual(200)
  expect(boardWidthPx).toBeLessThanOrEqual(300)
  const boardHeightPx = focal * board.getBoundingInfo().boundingBox.extendSize.y * 2 / range
  expect(boardHeightPx).toBeGreaterThanOrEqual(40)
  expect(boardHeightPx).toBeLessThanOrEqual(110)
  for (const node of root.getChildTransformNodes(true)) {
    const direction = node.position.normalizeToNew()
    expect(node.position.length()).toBeCloseTo(radius * (1 + field.height([direction.x, direction.y, direction.z]) * 0.05), 8)
  }
  const pole = scene.meshes.find((mesh) => mesh.name.endsWith(':pole'))!
  expect(pole.position.y - pole.getBoundingInfo().boundingBox.extendSize.y).toBeCloseTo(0, 9)
})
