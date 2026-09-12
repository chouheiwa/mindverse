import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { SurfaceBeacon } from './surfaceBeacons'

export interface PlanetSurfaceBeaconsOptions {
  /** 行星世界半径。 */
  readonly radius: number
  /**
   * 信标从哪里挂出去（父节点局部坐标）：落点，而不是星心。高度角是相对观察者
   * 的切平面算的，从星心挂出去的话，站在地表看会整体低十几度、掉到地平线下。
   */
  readonly origin?: readonly [number, number, number]
  readonly beacons: readonly SurfaceBeacon[]
}

/** 信标挂在几倍行星半径的天上：地平线以下的自然被星球挡住。 */
const BEACON_DISTANCE = 2.6
const SIBLING_COLOR = new Color3(0.72, 0.84, 1)
const WORMHOLE_COLOR = new Color3(0.35, 0.95, 0.85)

/**
 * 天上的邻居：同恒星系的问题是淡蓝的亮点，虫洞通向的星群是青绿的亮点。
 * 挂在行星中心外 2.6R 处的真实方向上，站在地表看，地平线以下的自然看不见。
 */
export class PlanetSurfaceBeacons {
  private readonly bodies: Mesh[] = []
  private readonly beaconByMeshId = new Map<number, SurfaceBeacon>()
  private readonly anchorByKey = new Map<string, { beacon: SurfaceBeacon; local: Vector3 }>()
  private readonly materials: StandardMaterial[] = []
  private disposed = false

  constructor(scene: Scene, parent: TransformNode, options: PlanetSurfaceBeaconsOptions) {
    const radius = Number.isFinite(options.radius) && options.radius > 0 ? options.radius : 1
    const origin = options.origin && options.origin.every(Number.isFinite)
      ? Vector3.FromArray(options.origin) : Vector3.Zero()
    const sibling = new StandardMaterial('surface-beacon:sibling', scene)
    sibling.emissiveColor = SIBLING_COLOR
    sibling.disableLighting = true
    const wormhole = new StandardMaterial('surface-beacon:wormhole', scene)
    wormhole.emissiveColor = WORMHOLE_COLOR
    wormhole.disableLighting = true
    this.materials.push(sibling, wormhole)
    for (const beacon of options.beacons) {
      const dir = Vector3.FromArray(beacon.direction)
      if (dir.lengthSquared() < 1e-12) continue
      dir.normalize()
      const local = origin.add(dir.scale(radius * BEACON_DISTANCE))
      const body = CreateSphere(`surface-beacon:${beacon.key}`, {
        diameter: radius * (beacon.kind === 'wormhole' ? 0.07 : 0.05), segments: 8,
      }, scene)
      body.parent = parent
      body.position.copyFrom(local)
      body.material = beacon.kind === 'wormhole' ? wormhole : sibling
      body.isPickable = true
      this.bodies.push(body)
      this.beaconByMeshId.set(body.uniqueId, beacon)
      this.anchorByKey.set(beacon.key, { beacon, local })
    }
  }

  beaconOf(meshUniqueId: number): SurfaceBeacon | null {
    return this.beaconByMeshId.get(meshUniqueId) ?? null
  }

  /** 每个信标在父节点局部空间的位置。 */
  anchors(): readonly { beacon: SurfaceBeacon; local: Vector3 }[] {
    return [...this.anchorByKey.values()].map(({ beacon, local }) => ({ beacon, local: local.clone() }))
  }

  diagnostics(): Readonly<{ beaconCount: number }> {
    return { beaconCount: this.disposed ? 0 : this.bodies.length }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const body of this.bodies) body.dispose(false, true)
    for (const material of this.materials) material.dispose()
    this.bodies.length = 0
    this.beaconByMeshId.clear()
    this.anchorByKey.clear()
  }
}
