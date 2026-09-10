import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import type { Material } from '@babylonjs/core/Materials/material.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Geometry } from '@babylonjs/core/Meshes/geometry.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Vec3 } from './cubeSphere'
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
}

export interface PlanetSurfaceWorldDiagnostics {
  readonly chunkCount: number
  readonly meshCount: number
  /** 只统计最近一次 update，便于发现静止相机仍在重建网格的回归。 */
  readonly builtThisUpdate: number
  readonly disposedThisUpdate: number
  /** 包含裙边，才能反映实际提交给 GPU 的顶点负担。 */
  readonly vertexCount: number
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

    for (const chunk of desired) {
      const key = chunkKey(chunk)
      // 二分坐标可精确表示，稳定的键让相机不动时连 CPU 地形采样也能省掉。
      if (this.chunks.has(key)) continue
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
