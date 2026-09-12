import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import type { Material } from '@babylonjs/core/Materials/material.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Geometry } from '@babylonjs/core/Meshes/geometry.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { faceDirection, type Vec3 } from './cubeSphere'
import { selectTerrainChunks, type TerrainChunk } from './terrainChunks'
import type { PlanetTerrainField } from './terrainField'
import { buildTerrainMesh } from './terrainMesh'

export interface PlanetSurfaceWorldOptions {
  /** 地表基色。不给就是中性岩灰。 */
  readonly albedo?: Vec3
  /** 地表材质。给了就用它（世界拥有它，dispose 时一起释放）；不给就是素色 StandardMaterial。 */
  readonly material?: Material
  readonly field: PlanetTerrainField
  readonly radius: number
  readonly displacement: number
  readonly resolution: number
  readonly skirtDepth: number
  readonly maxDepth: number
  readonly detailAngle: number
  readonly budget: number
  /**
   * 每次 update 最多新建多少块。
   *
   * Metal 实测：进入行星那一帧一次建了 303 块，单帧 2086.5ms，其余帧 <= 14.2ms ——
   * 那一下卡死把俯冲动画整个吞掉了。限量之后剩下的块顺着后面几帧补，画面才动得起来。
   */
  readonly buildBudgetPerUpdate?: number
}

/** 每帧建块的默认上限。 */
export const DEFAULT_BUILD_BUDGET_PER_UPDATE = 24

export interface PlanetSurfaceWorldDiagnostics {
  readonly chunkCount: number
  readonly meshCount: number
  /** 只统计最近一次 update，便于发现静止相机仍在重建网格的回归。 */
  readonly builtThisUpdate: number
  readonly disposedThisUpdate: number
  /** 包含裙边，才能反映实际提交给 GPU 的顶点负担。 */
  readonly vertexCount: number
  /** 还欠多少块没建。 */
  readonly pendingCount: number
  /** 选中的块是否已经全部建好。俯冲动画等这个信号才起步。 */
  readonly ready: boolean
}

interface ChunkMesh {
  readonly mesh: Mesh
  readonly geometry: Geometry
  readonly vertexCount: number
}

const chunkKey = (chunk: TerrainChunk): string =>
  `planet-surface:face=${chunk.face}:u=${chunk.u}:v=${chunk.v}:depth=${chunk.depth}`

export class PlanetSurfaceWorld {
  private readonly chunks = new Map<string, ChunkMesh>()
  private readonly scene: Scene
  private readonly parent: TransformNode
  private readonly options: PlanetSurfaceWorldOptions
  private readonly material: Material
  private builtThisUpdate = 0
  private disposedThisUpdate = 0
  private pendingCount = 0
  private disposed = false

  constructor(scene: Scene, parent: TransformNode, options: PlanetSurfaceWorldOptions) {
    this.scene = scene
    this.parent = parent
    // 块缓存依赖地形参数固定，复制选项可避免调用方改参数后新旧块形状不一致。
    this.options = { ...options }
    // 材质由世界共享，否则数百块会带来同样数量的材质和释放责任。
    if (options.material) {
      this.material = options.material
    } else {
      const plain = new StandardMaterial('planet-surface:material', scene)
      const albedo = options.albedo ?? [0.34, 0.33, 0.31]
      plain.diffuseColor = new Color3(albedo[0], albedo[1], albedo[2])
      plain.specularColor = new Color3(0.03, 0.03, 0.03)
      this.material = plain
    }
  }

  /** cameraDirection 在 parent 局部空间中；cameraRadius 以行星半径为单位，贴地约为 1。 */
  update(cameraDirection: Vec3, cameraRadius: number): void {
    this.builtThisUpdate = 0
    this.disposedThisUpdate = 0
    if (this.disposed) return

    const desired = selectTerrainChunks({ ...this.options, cameraDirection, cameraRadius })
    const keys = new Set(desired.map(chunkKey))
    for (const [key, entry] of this.chunks) {
      if (keys.has(key)) continue
      this.release(entry)
      this.chunks.delete(key)
      this.disposedThisUpdate += 1
    }

    // 缺哪些块。二分坐标可精确表示，稳定的键让相机不动时连 CPU 地形采样也能省掉。
    const missing = desired.filter((chunk) => !this.chunks.has(chunkKey(chunk)))
    // 正前方先成形：按块心方向与相机方向的夹角升序建。缺块期间玩家看到的是
    // 正前方完整、余光渐次补齐，而不是随机空洞。
    const facing = normalizeDirection(cameraDirection)
    missing.sort((left, right) => chunkFacing(right, facing) - chunkFacing(left, facing))
    const budget = buildBudgetOf(this.options.buildBudgetPerUpdate)
    this.pendingCount = Math.max(0, missing.length - budget)

    for (const chunk of missing.slice(0, budget)) {
      const key = chunkKey(chunk)
      const data = buildTerrainMesh({ ...this.options, chunk })
      const geometry = new Geometry(`${key}:geometry`, this.scene)
      geometry.setVerticesData('position', data.positions, false, 3)
      geometry.setVerticesData('normal', data.normals, false, 3)
      geometry.setIndices(data.indices)
      const mesh = new Mesh(key, this.scene)
      mesh.parent = this.parent
      mesh.material = this.material
      geometry.applyToMesh(mesh)
      this.chunks.set(key, { mesh, geometry, vertexCount: data.positions.length / 3 })
      this.builtThisUpdate += 1
    }
  }

  diagnostics(): PlanetSurfaceWorldDiagnostics {
    let vertexCount = 0
    for (const entry of this.chunks.values()) vertexCount += entry.vertexCount
    return Object.freeze({
      chunkCount: this.chunks.size,
      meshCount: this.chunks.size,
      builtThisUpdate: this.builtThisUpdate,
      disposedThisUpdate: this.disposedThisUpdate,
      pendingCount: this.disposed ? 0 : this.pendingCount,
      ready: this.disposed ? false : this.pendingCount === 0,
      vertexCount,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const entry of this.chunks.values()) this.release(entry)
    this.chunks.clear()
    this.material.dispose()
    this.builtThisUpdate = 0
    this.disposedThisUpdate = 0
  }

  private release(entry: ChunkMesh): void {
    // 块被替换时不能顺带销毁共享材质，其余块还要继续画。
    entry.mesh.dispose(false, false)
    entry.geometry.dispose()
  }
}

/** 预算防呆：非有限数、非正数、无穷大都退回默认值，绝不导致建不完。 */
function buildBudgetOf(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value) || value < 1) return DEFAULT_BUILD_BUDGET_PER_UPDATE
  return Math.floor(value)
}

const normalizeDirection = (direction: Vec3): Vec3 => {
  const length = Math.hypot(direction[0], direction[1], direction[2])
  return Number.isFinite(length) && length > 1e-9
    ? [direction[0] / length, direction[1] / length, direction[2] / length]
    : [0, 1, 0]
}

/** 块心方向与相机方向的余弦：越大越靠近视野正前方。 */
function chunkFacing(chunk: TerrainChunk, facing: Vec3): number {
  const centre = faceDirection(chunk.face, chunk.u, chunk.v)
  return centre[0] * facing[0] + centre[1] * facing[1] + centre[2] * facing[2]
}
