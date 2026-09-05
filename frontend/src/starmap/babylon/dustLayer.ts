import { Constants } from '@babylonjs/core/Engines/constants.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Geometry } from '@babylonjs/core/Meshes/geometry.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Mode, Universe } from '../../types'
import { starColor } from '../gl/blackbody'
import { DEPTH_FADE, ORBIT } from '../gl/chunks'
import { clusterAxis, orbitPeriod } from '../projection'
import type { BabylonCinematicEnvironment } from './cinematic'

// 尘埃与边缘微光，与 gl/dust.ts 同构。
//
// 尘埃 = 每一条真实内容一粒，跟着它所属的星群一起公转。它们不是装饰：
// 星群「有多重」在画面上就是这团尘埃有多稠。
//
// 边缘微光（solo）是没能进入任何星群的概念。旧版根本没画它们，于是
// 「边缘微光」这个模式点下去什么都不会发生 —— 那比难看更糟。
//
// 全场只有两个 batch：尘埃一个、微光一个，属性一次上传，公转与景深在
// 顶点着色器里算。

const VERTEX = /* glsl */ `
precision highp float;
${ORBIT}
${DEPTH_FADE}

attribute vec3 position;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute vec3 aColor;
attribute float aPeriod;
attribute float aSize;
attribute float aDim;
attribute float aSeed;

uniform mat4 worldView;
uniform mat4 projection;
uniform float uT;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
uniform float uTwinkle;

varying vec3 vColor;
varying float vAlpha;

void main(void) {
  vec3 p = orbitAround(position, aCenter, aAxis, aPeriod, uT * 0.001);
  vec4 mv = worldView * vec4(p, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projection * mv;

  float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uT / (1100.0 + mod(aSeed * 91.0, 1700.0)) + aSeed));
  vColor = aColor;
  vAlpha = aDim * tw * depthFade(viewZ, uNear, uFar);
  // 必须封顶。尘埃是一条内容，飞进恒星系时它按 1/z 能涨到上百像素，
  // 整个背景会糊成一团棉花。
  gl_PointSize = clamp(aSize * (uProjScale / viewZ), 1.0, 9.0);
}
`

const FRAGMENT = /* glsl */ `
precision highp float;
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main(void) {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(offset, offset);
  if (d2 > 1.0) discard;
  float energy = exp(-d2 * 3.4) * vAlpha;
  if (energy <= 0.0006) discard;
  gl_FragColor = vec4(vColor * energy * uGain, energy);
}
`

const ATTRIBUTES = ['position', 'aCenter', 'aAxis', 'aColor', 'aPeriod', 'aSize', 'aDim', 'aSeed']
const UNIFORMS = ['worldView', 'projection', 'uT', 'uProjScale', 'uNear', 'uFar', 'uTwinkle', 'uGain']

const DUST_GAIN = 0.30
const SOLO_GAIN = 0.85

/** 尘埃：只在虫洞模式里区分星群，其余模式整体退让给被强调的对象。 */
export function dustModeDimension(mode: Mode, inWormhole: boolean): number {
  if (mode === 'all') return 1
  if (mode === 'worm') return inWormhole ? 0.9 : 0.07
  return 0.12
}

/** 边缘微光在自己的模式里全亮，全景里保留一层底噪，其余模式退让。 */
export function soloModeDimension(mode: Mode): number {
  if (mode === 'solo') return 1
  return mode === 'all' ? 0.34 : 0.08
}

export interface DustLayerOptions {
  readonly environment: BabylonCinematicEnvironment
  readonly reducedMotion: boolean
  readonly parent?: TransformNode
}

export interface DustLayerDiagnostics {
  readonly dustCount: number
  readonly soloCount: number
  readonly batchCount: number
  readonly geometryCount: number
  readonly ownSize: number
  readonly otherSize: number
  readonly gains: readonly number[]
  readonly soloDimensions: readonly number[]
  readonly dustDimensions: readonly number[]
  readonly disposed: boolean
}

interface Batch {
  readonly mesh: Mesh
  readonly material: ShaderMaterial
  readonly geometry: Geometry
  readonly dimensions: Float32Array
  readonly baseGain: number
}

/** 抽稀时保留均匀分布的样本，而不是砍掉尾巴 —— 后者会让一整个星群消失。 */
export function densitySelection(total: number, density: number): number[] {
  if (total <= 0) return []
  const ratio = Number.isFinite(density) ? Math.min(1, Math.max(0, density)) : 1
  const kept = Math.max(1, Math.round(total * ratio))
  if (kept >= total) return Array.from({ length: total }, (_unused, index) => index)
  const step = total / kept
  return Array.from({ length: kept }, (_unused, index) => Math.min(total - 1, Math.floor(index * step)))
}

export class DustLayer {
  private readonly dust: Batch | null
  private readonly solo: Batch | null
  private readonly dustGroups: Int32Array
  private dim = 1
  private disposed = false
  private ownSizeValue = 0
  private otherSizeValue = 0

  constructor(scene: Scene, universe: Universe, options: DustLayerOptions) {
    const { environment, reducedMotion, parent } = options
    const centers = new Map<number, readonly [number, number, number]>()
    const axes = new Map<number, readonly [number, number, number]>()
    const hues = new Map<number, readonly [number, number]>()
    for (const cluster of universe.clusters ?? []) {
      centers.set(cluster.g, cluster.c)
      axes.set(cluster.g, clusterAxis(cluster.g))
      hues.set(cluster.g, [cluster.hue, cluster.sat])
    }

    const particles = universe.particles ?? []
    const dustIndices = densitySelection(particles.length, environment.dustDensity)
    this.dustGroups = Int32Array.from(dustIndices, (index) => particles[index]![3] ?? 0)
    this.dust = dustIndices.length > 0
      ? this.createBatch(scene, 'dust', dustIndices.length, DUST_GAIN, reducedMotion ? 0 : 0, parent, (slot, write) => {
        const particle = particles[dustIndices[slot]!]!
        const group = particle[3] ?? 0
        const [hue, saturation] = hues.get(group) ?? [218, 0]
        const own = particle[4] ? 1 : 0
        write.position = [particle[0], particle[1], particle[2]]
        write.center = centers.get(group) ?? [0, 0, 0]
        write.axis = axes.get(group) ?? [0, 1, 0]
        write.period = orbitPeriod(write.position, write.center)
        // 本人创作的那一粒亮一点、白一点 —— 画面里唯一区分「写过 / 收过」的尘埃线索
        write.color = starColor(hue, own ? Math.max(saturation, 24) : saturation)
        write.size = own ? 1.9 : 1.35
        write.seed = dustIndices[slot]! * 0.618
        if (own) this.ownSizeValue = write.size
        else this.otherSizeValue = write.size
      })
      : null

    const solos = universe.solo ?? []
    const soloIndices = densitySelection(solos.length, environment.dustDensity)
    this.solo = soloIndices.length > 0
      // 边缘微光会呼吸：它们是「差一点就成星」的东西，闪烁本身就是语义
      ? this.createBatch(scene, 'solo', soloIndices.length, SOLO_GAIN, reducedMotion ? 0 : 0.55, parent, (slot, write) => {
        const source = solos[soloIndices[slot]!]!
        write.position = [source.p[0], source.p[1], source.p[2]]
        write.center = write.position
        write.axis = [0, 1, 0]
        write.period = 0
        write.color = [0.72, 0.80, 1.0]
        write.size = 2.2
        write.seed = soloIndices[slot]! * 1.37 + 5
      })
      : null
  }

  setUniform(name: string, value: number): void {
    if (this.disposed) return
    for (const batch of this.batches()) batch.material.setFloat(name, value)
  }

  setMode(mode: Mode, universe: Universe, wormIndex: number): void {
    if (this.disposed) return
    const wormhole = universe.wormholes?.[wormIndex]
    if (this.dust) {
      for (let index = 0; index < this.dust.dimensions.length; index += 1) {
        const group = this.dustGroups[index]!
        const inWormhole = Boolean(wormhole) && (group === wormhole!.a || group === wormhole!.b)
        this.dust.dimensions[index] = dustModeDimension(mode, inWormhole)
      }
      this.dust.geometry.updateVerticesData('aDim', this.dust.dimensions, false)
    }
    if (this.solo) {
      this.solo.dimensions.fill(soloModeDimension(mode))
      this.solo.geometry.updateVerticesData('aDim', this.solo.dimensions, false)
    }
  }

  /** 与星云一样，聚焦时整体退让而不是熄灭。 */
  setDim(value: number): void {
    if (this.disposed) return
    this.dim = Number.isFinite(value) ? Math.max(0, value) : 1
    for (const batch of this.batches()) batch.material.setFloat('uGain', batch.baseGain * this.dim)
  }

  diagnostics(): DustLayerDiagnostics {
    return Object.freeze({
      dustCount: this.dust?.dimensions.length ?? 0,
      soloCount: this.solo?.dimensions.length ?? 0,
      batchCount: this.disposed ? 0 : this.batches().length,
      geometryCount: this.disposed ? 0 : this.batches().length,
      ownSize: this.ownSizeValue,
      otherSize: this.otherSizeValue,
      gains: this.batches().map(({ baseGain }) => baseGain * this.dim),
      soloDimensions: Array.from(this.solo?.dimensions ?? []),
      dustDimensions: Array.from(this.dust?.dimensions ?? []),
      disposed: this.disposed,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const batch of [this.dust, this.solo]) {
      if (!batch) continue
      batch.mesh.dispose(false, false)
      batch.material.dispose()
      batch.geometry.dispose()
    }
  }

  private batches(): readonly Batch[] {
    return [this.dust, this.solo].filter((batch): batch is Batch => batch !== null)
  }

  private createBatch(
    scene: Scene,
    name: string,
    count: number,
    baseGain: number,
    twinkle: number,
    parent: TransformNode | undefined,
    fill: (slot: number, write: PointWriter) => void,
  ): Batch {
    const position = new Float32Array(count * 3)
    const center = new Float32Array(count * 3)
    const axis = new Float32Array(count * 3)
    const color = new Float32Array(count * 3)
    const period = new Float32Array(count)
    const size = new Float32Array(count)
    const dimensions = new Float32Array(count).fill(1)
    const seed = new Float32Array(count)
    const write: PointWriter = {
      position: [0, 0, 0], center: [0, 0, 0], axis: [0, 1, 0],
      color: [1, 1, 1], period: 0, size: 1, seed: 0,
    }
    for (let slot = 0; slot < count; slot += 1) {
      fill(slot, write)
      position.set(write.position, slot * 3)
      center.set(write.center, slot * 3)
      axis.set(write.axis, slot * 3)
      color.set(write.color, slot * 3)
      period[slot] = write.period
      size[slot] = write.size
      seed[slot] = write.seed
    }

    const geometry = new Geometry(`dust:${name}:geometry`, scene)
    geometry.setVerticesData('position', position, false, 3)
    geometry.setVerticesData('aCenter', center, false, 3)
    geometry.setVerticesData('aAxis', axis, false, 3)
    geometry.setVerticesData('aColor', color, false, 3)
    geometry.setVerticesData('aPeriod', period, false, 1)
    geometry.setVerticesData('aSize', size, false, 1)
    geometry.setVerticesData('aDim', dimensions, true, 1)
    geometry.setVerticesData('aSeed', seed, false, 1)

    const mesh = new Mesh(`dust:${name}`, scene)
    mesh.parent = parent ?? null
    mesh.isPickable = false
    mesh.isUnIndexed = true
    mesh.alwaysSelectAsActiveMesh = true
    geometry.applyToMesh(mesh)

    const material = new ShaderMaterial(`dust:${name}:material`, scene, {
      vertexSource: VERTEX, fragmentSource: FRAGMENT,
    }, { attributes: ATTRIBUTES, uniforms: UNIFORMS, needAlphaBlending: true })
    material.fillMode = Constants.MATERIAL_PointFillMode
    material.alphaMode = Constants.ALPHA_ADD
    material.disableDepthWrite = true
    material.setFloat('uT', 0)
    material.setFloat('uProjScale', 500)
    material.setFloat('uNear', 1)
    material.setFloat('uFar', 4000)
    material.setFloat('uTwinkle', twinkle)
    material.setFloat('uGain', baseGain)
    mesh.material = material

    return Object.freeze({ mesh, material, geometry, dimensions, baseGain })
  }
}

interface PointWriter {
  position: readonly [number, number, number]
  center: readonly [number, number, number]
  axis: readonly [number, number, number]
  color: readonly [number, number, number]
  period: number
  size: number
  seed: number
}
