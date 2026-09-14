import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder'
import type { SurfaceContactSampler } from './surfaceContact'
import { fitSignpostTitle } from './signpostText'
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
  readonly label?: { readonly date: string; readonly title: string }
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
  private signpostNode: TransformNode | null = null
  private signpostOffset = 0
  private labelTexture: DynamicTexture | null = null
  private signpostAnchor: Vector3 | null = null
  private disposed = false

  constructor(scene: Scene, parent: TransformNode, options: PlanetSurfaceTrailOptions) {
    const radius = Number.isFinite(options.radius) && options.radius > 0 ? options.radius : 1
    const displacement = Number.isFinite(options.displacement) ? options.displacement : 0
    const print = new StandardMaterial('surface-trail:print', scene)
    print.diffuseColor = new Color3(0.32, 0.27, 0.22)
    print.emissiveColor = new Color3(0.05, 0.04, 0.03)
    print.alpha = 0.32
    const post = new StandardMaterial('surface-trail:post', scene)
    post.diffuseColor = new Color3(0.78, 0.74, 0.66)
    post.emissiveColor = new Color3(0.1, 0.09, 0.08)
    const board = new StandardMaterial('surface-trail:board', scene)
    board.diffuseColor = new Color3(0.46, 0.40, 0.30)
    board.emissiveColor = new Color3(0.015, 0.014, 0.012)
    board.backFaceCulling = false
    for (const material of [print, post, board]) material.specularColor = Color3.Black()
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
      const disc = CreateDisc(`${node.name}:print`, { radius: radius * 0.0016, tessellation: 20 }, scene)
      disc.scaling.x = 0.48
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
      // f=720/(2tan30°)=623.54px；眼高 0.012R、θ=0.060，横板中心高 0.0141R。
      // z=(1+0.0141)R·sinθ≈0.0609R，宽 0.024R 投影 f·w/z≈246px —— 正好装下那行标签
      // （实测「2026.01 你从这里去了 → 《当前表层问题》」约 246px 宽、28px 高）。
      // 板子要装得下字，否则又变回「只剩一行字浮在半空」。厚度不承担可见性，必须让宽面朝落点。
      const observer = Vector3.FromArray(options.layout.landing ?? options.layout.steps[0] ?? options.layout.signpost)
      const towardObserver = observer.subtract(signDirection.scale(Vector3.Dot(observer, signDirection)))
      if (towardObserver.lengthSquared() > 1e-12) {
        const front = towardObserver.normalize()
        const right = Vector3.Cross(signDirection, front).normalize()
        node.rotationQuaternion = Quaternion.RotationQuaternionFromAxis(right, signDirection, front)
      }
      const poleHeight = radius * 0.016
      const pole = CreateCylinder(`${node.name}:pole`, { height: poleHeight, diameter: radius * 0.0007, tessellation: 6 }, scene)
      pole.position.y = poleHeight / 2
      pole.material = post
      const plank = CreateBox(`${node.name}:board`, { width: radius * 0.024, height: radius * 0.0075, depth: radius * 0.0010 }, scene)
      plank.position.y = poleHeight * 0.88
      plank.material = board
      for (const body of [pole, plank] as Mesh[]) {
        body.parent = node
        body.isPickable = true
        this.signpostMeshIds.add(body.uniqueId)
      }
      // 标签要落在横板上，不是落在杆脚下。锚在地面时字会掉到板子下方一大截，
      // 读起来是「一块空白广告牌 + 一行无关的字」，正是这次要修的观感问题。
      this.signpostNode = node
      this.signpostOffset = plank.position.y
      this.signpostAnchor = node.position.add(signDirection.scale(plank.position.y))
      if (options.label) {
        const texture = new DynamicTexture('surface-trail:lettering', { width: 1024, height: 320 }, scene, true)
        this.labelTexture = texture
        const context = texture.getContext() as CanvasRenderingContext2D
        context.fillStyle = '#e8e2ce'
        context.fillRect(0, 0, 1024, 320)
        context.strokeStyle = '#87836f'
        context.lineWidth = 3
        context.strokeRect(14, 14, 996, 292)
        context.textAlign = 'left'
        context.textBaseline = 'middle'
        context.fillStyle = '#4a504c'
        context.font = '500 30px sans-serif'
        context.fillText(`${options.label.date}  ·  下一站`, 48, 64)
        context.fillStyle = '#202c2b'
        context.font = '600 52px sans-serif'
        const lines = fitSignpostTitle(options.label.title, 846, text => context.measureText(text).width)
        lines.forEach((line, index) => context.fillText(line, 48, 148 + index * 62))
        context.font = '48px sans-serif'
        context.fillText('→', 920, 168)
        texture.update()
        const lettering = new StandardMaterial('surface-trail:lettering-material', scene)
        lettering.disableLighting = true
        // Diffuse texture multiplies the constant light; an emissive texture adds to it and washes out the ink.
        lettering.diffuseTexture = texture
        lettering.emissiveColor = new Color3(0.95, 0.95, 0.95)
        lettering.diffuseColor = Color3.Black()
        lettering.specularColor = Color3.Black()
        lettering.backFaceCulling = false
        this.materials.push(lettering)
        const face = CreatePlane('surface-trail:lettering-face', { width: radius * 0.0235, height: radius * 0.007 }, scene)
        face.parent = plank
        face.position.z = radius * 0.00051
        // The board's +Z side faces the landing; Babylon's plane front is -Z.
        face.rotation.y = Math.PI
        face.material = lettering
        face.isPickable = true
        this.signpostMeshIds.add(face.uniqueId)
      }
    }
  }

  conformToTerrain(sample: SurfaceContactSampler): void {
    if (this.disposed) return
    for (const node of this.nodes) {
      const direction = node.position.normalizeToNew()
      const contact = sample(direction)
      if (!contact) continue
      node.position.copyFrom(contact.point)
      if (node !== this.signpostNode) node.rotationQuaternion = quaternionFromYTo(contact.normal)
    }
    if (this.signpostNode) {
      const up = this.signpostNode.position.normalizeToNew()
      this.signpostAnchor = this.signpostNode.position.add(up.scale(this.signpostOffset))
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
    this.signpostNode = null
    this.labelTexture?.dispose()
    this.labelTexture = null
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
