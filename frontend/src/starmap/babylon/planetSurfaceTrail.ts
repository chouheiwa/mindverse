import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { CreateDisc } from '@babylonjs/core/Meshes/Builders/discBuilder.js'
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { PlanetTerrainField } from './terrainField'
import type { SurfaceTrailLayout } from './surfaceTrail'

export interface PlanetSurfaceTrailOptions {
  readonly field: PlanetTerrainField
  readonly radius: number
  readonly displacement: number
  readonly layout: SurfaceTrailLayout
}

/**
 * 从落点踩出去的小径与尽头的路牌。脚印是贴地的小圆片，路牌是一根杆加一块牌。
 * 尺寸按行星半径取比例。
 */
export class PlanetSurfaceTrail {
  private readonly nodes: TransformNode[] = []
  private readonly signpostMeshIds = new Set<number>()
  private readonly materials: StandardMaterial[] = []
  private signpostAnchor: Vector3 | null = null
  private disposed = false

  constructor(scene: Scene, parent: TransformNode, options: PlanetSurfaceTrailOptions) {
    const radius = Number.isFinite(options.radius) && options.radius > 0 ? options.radius : 1
    const displacement = Number.isFinite(options.displacement) ? options.displacement : 0
    const print = new StandardMaterial('surface-trail:print', scene)
    print.diffuseColor = new Color3(0.2, 0.17, 0.14)
    print.emissiveColor = new Color3(0.05, 0.04, 0.03)
    print.alpha = 0.72
    const post = new StandardMaterial('surface-trail:post', scene)
    post.diffuseColor = new Color3(0.78, 0.74, 0.66)
    post.emissiveColor = new Color3(0.1, 0.09, 0.08)
    const board = new StandardMaterial('surface-trail:board', scene)
    board.diffuseColor = new Color3(0.98, 0.84, 0.46)
    board.emissiveColor = new Color3(0.5, 0.4, 0.16)
    board.backFaceCulling = false
    this.materials.push(print, post, board)

    const ground = (direction: Vector3): Vector3 => {
      const height = options.field.height([direction.x, direction.y, direction.z])
      return direction.scale(radius * (1 + (Number.isFinite(height) ? height : 0) * displacement))
    }
    const plant = (name: string, direction: Vector3): TransformNode => {
      const node = new TransformNode(name, scene)
      node.parent = parent
      node.position.copyFrom(ground(direction))
      node.rotationQuaternion = quaternionFromYTo(direction)
      this.nodes.push(node)
      return node
    }

    options.layout.steps.forEach((step, index) => {
      const direction = Vector3.FromArray(step)
      if (direction.lengthSquared() < 1e-12) return
      direction.normalize()
      const node = plant(`surface-trail:step:${index}`, direction)
      const disc = CreateDisc(`${node.name}:print`, { radius: radius * 0.0016, tessellation: 10 }, scene)
      disc.rotation.x = Math.PI / 2
      disc.position.y = radius * 0.0002
      disc.material = print
      disc.parent = node
      disc.isPickable = false
    })

    const signDirection = Vector3.FromArray(options.layout.signpost)
    if (signDirection.lengthSquared() > 1e-12) {
      signDirection.normalize()
      const node = plant('surface-trail:signpost', signDirection)
      const poleHeight = radius * 0.016
      const pole = CreateCylinder(`${node.name}:pole`, { height: poleHeight, diameter: radius * 0.001, tessellation: 6 }, scene)
      pole.position.y = poleHeight / 2
      pole.material = post
      const plank = CreateBox(`${node.name}:board`, { width: radius * 0.012, height: radius * 0.0045, depth: radius * 0.0006 }, scene)
      plank.position.y = poleHeight * 0.88
      plank.material = board
      for (const body of [pole, plank] as Mesh[]) {
        body.parent = node
        body.isPickable = true
        this.signpostMeshIds.add(body.uniqueId)
      }
      this.signpostAnchor = node.position.clone()
    }
  }

  /** 路牌在父节点局部空间的落点。 */
  signpost(): Vector3 | null {
    return this.signpostAnchor ? this.signpostAnchor.clone() : null
  }

  isSignpostMesh(meshUniqueId: number): boolean {
    return this.signpostMeshIds.has(meshUniqueId)
  }

  diagnostics(): Readonly<{ stepCount: number; signpost: boolean }> {
    return { stepCount: this.disposed ? 0 : Math.max(0, this.nodes.length - (this.signpostAnchor ? 1 : 0)), signpost: !this.disposed && this.signpostAnchor !== null }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const node of this.nodes) node.dispose(false, true)
    for (const material of this.materials) material.dispose()
    this.nodes.length = 0
    this.signpostMeshIds.clear()
    this.signpostAnchor = null
  }
}

function quaternionFromYTo(direction: Vector3): Quaternion {
  const from = Vector3.Up()
  const dot = Vector3.Dot(from, direction)
  if (dot > 0.999999) return Quaternion.Identity()
  if (dot < -0.999999) return Quaternion.RotationAxis(Vector3.Right(), Math.PI)
  const axis = Vector3.Cross(from, direction).normalize()
  return Quaternion.RotationAxis(axis, Math.acos(Math.max(-1, Math.min(1, dot))))
}
