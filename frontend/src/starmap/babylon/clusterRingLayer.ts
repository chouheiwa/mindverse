import { Constants } from '@babylonjs/core/Engines/constants.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Geometry } from '@babylonjs/core/Meshes/geometry.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Cluster, Mode, Universe } from '../../types'
import { ownerOpacity } from '../focusEmphasis'
import { starColor } from '../gl/blackbody'
import { DEPTH_FADE } from '../gl/chunks'
import { describeMode } from '../modeSemantics'
import { clusterAxis, orbitRing } from '../projection'

// 星群结构环，与 gl/rings.ts 同构。
//
// 「这是个星系」最强的一个视觉信号，而且是免费的诚实：环画在恒星真实的
// 公转半径上，透视由 3D 投影自己给出。全部星群的全部环合成一个批次。

const SAMPLES = 96
/** 环的基础增益。缩放淡出是乘在它上面的，见 clusterRingVisibility。 */
export const CLUSTER_RING_GAIN = 0.24

const VERTEX = /* glsl */ `
precision highp float;
${DEPTH_FADE}
attribute vec3 position;
attribute vec3 aColor;
attribute float aDim;
uniform mat4 worldView;
uniform mat4 projection;
uniform float uNear;
uniform float uFar;
varying vec3 vColor;
varying float vAlpha;
void main(void) {
  vec4 mv = worldView * vec4(position, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projection * mv;
  vColor = aColor;
  vAlpha = aDim * depthFade(viewZ, uNear, uFar);
}
`

const FRAGMENT = /* glsl */ `
precision highp float;
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main(void) {
  if (vAlpha <= 0.002) discard;
  gl_FragColor = vec4(vColor * vAlpha * uGain, vAlpha);
}
`

/** 画环只需要概念名与坐标，两种恒星形态都满足。 */
export type RingStar = Readonly<{ c: string, p: readonly [number, number, number] }>

/** 成员恒星到星群质心的整数化半径；1.5 以内的不画，那是质心本身。 */
export function ringRadiiForCluster(cluster: Cluster, stars: readonly RingStar[]): number[] {
  const radii = new Set<number>()
  for (const name of cluster.mem ?? []) {
    const star = stars.find((candidate) => candidate.c === name)
    if (!star) continue
    const radius = Math.hypot(
      star.p[0] - cluster.c[0], star.p[1] - cluster.c[1], star.p[2] - cluster.c[2],
    )
    if (radius > 1.5) radii.add(Math.round(radius))
  }
  return [...radii].sort((left, right) => left - right)
}

export interface ClusterRingLayerDiagnostics {
  readonly ringCount: number
  /** 实际交给材质的增益。缩放淡出只体现在这里 —— 帧描述子看不见它。 */
  readonly gain: number
  readonly batchCount: number
  readonly vertexCount: number
  readonly dimensions: readonly number[]
  readonly disposed: boolean
}

export class ClusterRingLayer {
  private readonly mesh: Mesh | null = null
  private readonly material: ShaderMaterial | null = null
  private readonly geometry: Geometry | null = null
  private readonly groups: Int32Array
  private readonly modeDimensions: Float32Array
  private gainValue = CLUSTER_RING_GAIN
  private readonly dimensions: Float32Array
  private readonly ringCountValue: number
  private focusedCluster: number | null = null
  private disposed = false

  constructor(scene: Scene, universe: Universe, parent?: TransformNode) {
    const positions: number[] = []
    const colors: number[] = []
    const groups: number[] = []
    let ringCount = 0

    for (const cluster of universe.clusters ?? []) {
      const axis = clusterAxis(cluster.g)
      const color = starColor(cluster.hue, cluster.sat)
      for (const radius of ringRadiiForCluster(cluster, (universe.stars ?? []) as readonly RingStar[])) {
        ringCount += 1
        const ring = orbitRing(cluster.c, axis, radius, SAMPLES)
        for (let index = 0; index < ring.length; index += 1) {
          const from = ring[index]!
          const to = ring[(index + 1) % ring.length]!
          positions.push(from[0], from[1], from[2], to[0], to[1], to[2])
          colors.push(color[0], color[1], color[2], color[0], color[1], color[2])
          groups.push(cluster.g, cluster.g)
        }
      }
    }

    this.ringCountValue = ringCount
    this.groups = Int32Array.from(groups)
    this.modeDimensions = new Float32Array(groups.length).fill(1)
    this.dimensions = new Float32Array(groups.length).fill(1)
    if (groups.length === 0) return

    this.geometry = new Geometry('cluster-rings:geometry', scene)
    this.geometry.setVerticesData('position', Float32Array.from(positions), false, 3)
    this.geometry.setVerticesData('aColor', Float32Array.from(colors), false, 3)
    this.geometry.setVerticesData('aDim', this.dimensions, true, 1)

    this.mesh = new Mesh('cluster-rings', scene)
    this.mesh.parent = parent ?? null
    this.mesh.isPickable = false
    this.mesh.isUnIndexed = true
    this.mesh.alwaysSelectAsActiveMesh = true
    this.geometry.applyToMesh(this.mesh)

    this.material = new ShaderMaterial('cluster-rings:material', scene, {
      vertexSource: VERTEX, fragmentSource: FRAGMENT,
    }, {
      attributes: ['position', 'aColor', 'aDim'],
      uniforms: ['worldView', 'projection', 'uNear', 'uFar', 'uGain'],
      needAlphaBlending: true,
    })
    this.material.fillMode = Constants.MATERIAL_LineListDrawMode
    this.material.alphaMode = Constants.ALPHA_ADD
    this.material.disableDepthWrite = true
    this.material.setFloat('uNear', 1)
    this.material.setFloat('uFar', 4000)
    this.material.setFloat('uGain', CLUSTER_RING_GAIN)
    this.mesh.material = this.material
  }

  setUniform(name: string, value: number): void {
    if (this.disposed) return
    this.material?.setFloat(name, value)
    if (name === 'uGain') this.gainValue = value
  }

  setMode(mode: Mode, universe: Universe, wormIndex: number): void {
    if (this.disposed) return
    const semantics = describeMode(mode, universe, wormIndex)
    const wormholeClusters = new Set(semantics.wormholeClusters)
    for (let index = 0; index < this.modeDimensions.length; index += 1) {
      this.modeDimensions[index] = mode === 'worm'
        // 虫洞模式下只有两端的星群保留结构环，其余退到底噪。
        ? (wormholeClusters.has(this.groups[index]!) ? 1 : semantics.layers.clusterRings)
        : semantics.layers.clusterRings
    }
    this.applyDimensions()
  }

  setFocus(clusterId: number | null): void {
    if (this.disposed) return
    this.focusedCluster = clusterId
    this.applyDimensions()
  }

  diagnostics(): ClusterRingLayerDiagnostics {
    return Object.freeze({
      ringCount: this.ringCountValue,
      gain: this.gainValue,
      batchCount: this.disposed || !this.mesh ? 0 : 1,
      vertexCount: this.groups.length,
      dimensions: Array.from(this.dimensions),
      disposed: this.disposed,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.mesh?.dispose(false, false)
    this.material?.dispose()
    this.geometry?.dispose()
  }

  private applyDimensions(): void {
    for (let index = 0; index < this.dimensions.length; index += 1) {
      this.dimensions[index] = this.modeDimensions[index]!
        * ownerOpacity(this.groups[index]!, this.focusedCluster)
    }
    this.geometry?.updateVerticesData('aDim', this.dimensions, false)
  }
}
