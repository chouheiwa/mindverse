import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { PlanetTerrainField } from './terrainField'
import type { SurfaceMarkPlacement } from './surfaceMarks'

export interface PlanetSurfaceMarksOptions {
  readonly field: PlanetTerrainField
  /** 行星世界半径。 */
  readonly radius: number
  readonly displacement: number
  readonly placements: readonly SurfaceMarkPlacement[]
}

/**
 * 落点旁你留下的痕迹：创作的回答是旗，收藏的是石堆。贴地放置，可点。
 *
 * 尺寸按行星半径取比例：旗杆高 0.032R，旗面 0.018R×0.012R，石堆底石直径 0.014R。
 * 针孔焦距 f=720/(2tan30°)=623.54px；眼高 e=0.012R，角距 θ=0.034。
 * 杆底/顶投影 y(h)=f·((R+h)cosθ−(R+e))/((R+h)sinθ)，
 * y(0.032R)−y(0)≈576px；最远 θ=0.070 时仍约 280px，旗面高约 104px。
 */
export class PlanetSurfaceMarks {
  private readonly nodes: TransformNode[] = []
  private readonly answerByMeshId = new Map<number, string>()
  private readonly anchors = new Map<string, Vector3>()
  private readonly materials: StandardMaterial[] = []
  private disposed = false

  constructor(scene: Scene, parent: TransformNode, options: PlanetSurfaceMarksOptions) {
    const radius = Number.isFinite(options.radius) && options.radius > 0 ? options.radius : 1
    const displacement = Number.isFinite(options.displacement) ? options.displacement : 0
    const pole = new StandardMaterial('surface-mark:pole', scene)
    pole.diffuseColor = new Color3(0.82, 0.8, 0.76)
    pole.emissiveColor = new Color3(0.12, 0.12, 0.11)
    const banner = new StandardMaterial('surface-mark:banner', scene)
    banner.diffuseColor = new Color3(0.95, 0.72, 0.28)
    banner.emissiveColor = new Color3(0.55, 0.36, 0.08)
    banner.backFaceCulling = false
    const stone = new StandardMaterial('surface-mark:stone', scene)
    stone.diffuseColor = new Color3(0.42, 0.44, 0.47)
    stone.emissiveColor = new Color3(0.06, 0.07, 0.08)
    this.materials.push(pole, banner, stone)

    for (const placement of options.placements) {
      const direction = Vector3.FromArray(placement.direction)
      if (direction.lengthSquared() < 1e-12) continue
      direction.normalize()
      const height = options.field.height([direction.x, direction.y, direction.z])
      const ground = direction.scale(radius * (1 + (Number.isFinite(height) ? height : 0) * displacement))
      const node = new TransformNode(`surface-mark:${placement.answerId}`, scene)
      node.parent = parent
      node.position.copyFrom(ground)
      // 本地 Y 对齐脚下法线。
      node.rotationQuaternion = quaternionFromYTo(direction)
      const bodies: Mesh[] = []
      if (placement.kind === 'flag') {
        // f=720/(2tan30°)=623.5px/rad：0.007R 的杆在最近 0.034R 处约 128px、最远 0.070R 处约 62px。
        // 杆径按 9px 反解，避免近处读成柱子。
        const poleHeight = radius * 0.007
        const shaft = CreateCylinder(`${node.name}:pole`, { height: poleHeight, diameter: radius * 0.0005, tessellation: 6 }, scene)
        shaft.position.y = poleHeight / 2
        shaft.material = pole
        const cloth = CreatePlane(`${node.name}:banner`, { width: radius * 0.0040, height: radius * 0.0026 }, scene)
        cloth.position.set(radius * 0.0020, poleHeight * 0.80, 0)
        cloth.material = banner
        bodies.push(shaft, cloth)
      } else {
        // 底石接地，上层略微相交承托，横向错位使轮廓能读成石堆而不是串珠。
        // 底石 0.0038R 在最近 0.034R 处约 70px、最远 0.070R 处约 34px 宽，与眼高 0.012R 一起读成膝高石堆。
        const stones = [
          { diameter: 0.0038, x: 0, z: 0 },
          { diameter: 0.0027, x: 0.0005, z: 0.00027 },
          { diameter: 0.0019, x: -0.00027, z: 0.0004 },
        ] as const
        let y = 0
        stones.forEach(({ diameter: ratio, x, z }, index) => {
          const diameter = radius * ratio
          const rock = CreateSphere(`${node.name}:stone:${index}`, { diameter, segments: 6 }, scene)
          rock.position.set(radius * x, y + diameter / 2, radius * z)
          rock.material = stone
          bodies.push(rock)
          y += diameter * 0.8
        })
      }
      for (const body of bodies) {
        body.parent = node
        body.isPickable = true
        this.answerByMeshId.set(body.uniqueId, placement.answerId)
      }
      this.nodes.push(node)
      this.anchors.set(placement.answerId, ground)
    }
  }

  pickableMeshes(): readonly Mesh[] {
    return this.nodes.flatMap((node) => node.getChildMeshes(true) as Mesh[])
  }

  answerIdOf(meshUniqueId: number): string | null {
    return this.answerByMeshId.get(meshUniqueId) ?? null
  }

  /** 标记在父节点局部空间的落点；用于诊断投影。 */
  anchorOf(answerId: string): Vector3 | null {
    const anchor = this.anchors.get(answerId)
    return anchor ? anchor.clone() : null
  }

  answerIds(): readonly string[] {
    return [...this.anchors.keys()]
  }

  diagnostics(): Readonly<{ markCount: number }> {
    return { markCount: this.disposed ? 0 : this.nodes.length }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const node of this.nodes) node.dispose(false, true)
    for (const material of this.materials) material.dispose()
    this.nodes.length = 0
    this.answerByMeshId.clear()
    this.anchors.clear()
  }
}

/** 把本地 Y 轴转到 `direction` 的四元数。 */
function quaternionFromYTo(direction: Vector3): Quaternion {
  const from = Vector3.Up()
  const dot = Vector3.Dot(from, direction)
  if (dot > 0.999999) return Quaternion.Identity()
  if (dot < -0.999999) return Quaternion.RotationAxis(Vector3.Right(), Math.PI)
  const axis = Vector3.Cross(from, direction).normalize()
  return Quaternion.RotationAxis(axis, Math.acos(Math.max(-1, Math.min(1, dot))))
}
