import { Constants } from '@babylonjs/core/Engines/constants.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Geometry } from '@babylonjs/core/Meshes/geometry.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { blackbodyRGB } from '../gl/blackbody'
import type { Quality } from '../quality'
import { babylonUpliftTier, type BabylonUpliftTier } from './visualUplift'

// 深空星场。
//
// 迁移前后都没有这一层：全景里除了自己的恒星、星云和尘埃，背景是纯黑。
// 于是宇宙没有「远」—— 所有东西都在同一个深度上，画面读起来是一张贴纸。
//
// 三个原则：
//
// 1. **纵深来自分层视差**：三层壳各有自己的半径，相机一动，近层比远层
//    移动得快。这是纵深唯一诚实的来源，堆数量堆不出来。
// 2. **克制**：最远那层最密但最暗（alpha 0.30），最近那层最稀但最亮。
//    白茫茫一片的点阵不是星空，是噪点。分档上限由 visualUplift 盯住。
// 3. **有色温**：星场是从蓝白到橙红的一条谱带，不是一堆白点。谱型分布
//    按真实的主序星丰度取（M/K 型远多于 O/B 型）。

const VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 aColor;
attribute float aSize;
attribute float aSeed;
uniform mat4 worldView;
uniform mat4 projection;
uniform float uTime;
uniform float uTwinkle;
uniform float uProjScale;
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main(void) {
  vec4 mv = worldView * vec4(position, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projection * mv;
  // 闪烁是大气视宁度，不是恒星本身。它幅度小、周期各不相同，
  // 于是整片星场不会同呼吸 —— 那会读成一次曝光抖动。
  float twinkle = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime / (900.0 + mod(aSeed * 137.0, 2300.0)) + aSeed));
  vColor = aColor;
  vAlpha = twinkle * uOpacity;
  gl_PointSize = clamp(aSize * (uProjScale / viewZ), 1.0, 3.4);
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
  float energy = exp(-d2 * 3.9) * vAlpha;
  if (energy <= 0.0008) discard;
  gl_FragColor = vec4(vColor * energy * uGain, energy);
}
`

const ATTRIBUTES = ['position', 'aColor', 'aSize', 'aSeed']
const UNIFORMS = ['worldView', 'projection', 'uTime', 'uTwinkle', 'uProjScale', 'uOpacity', 'uGain']

/** 闪烁幅度。再大一点就从「星星在闪」变成「画面在抖」。 */
const TWINKLE = 0.18
/**
 * 相机贴近主体时星场退到的底噪。
 *
 * 不能退到 0：背景一旦全黑，近景就没有可参照的远处，主体反而显得平。
 */
const PHASE_OPACITY_FLOOR = 0.22

export interface StarfieldStratum {
  readonly radius: number
  readonly count: number
  readonly alpha: number
  readonly size: number
}

/** 三层壳的半径倍率：相机在中间，倍率必须真的分开才有视差。 */
const SHELL_RADIUS_SCALE = Object.freeze([1.55, 2.35, 3.6] as const)
/** 计数权重：越远越密。 */
const SHELL_COUNT_WEIGHT = Object.freeze([0.18, 0.31, 0.51] as const)
/** 每层的 alpha 与点径。近层亮而大，远层暗而小。 */
const SHELL_ALPHA = Object.freeze([0.82, 0.54, 0.30] as const)
const SHELL_SIZE = Object.freeze([2.6, 1.9, 1.3] as const)

export function starfieldStrata(tier: BabylonUpliftTier, sceneRadius: number): readonly StarfieldStratum[] {
  const base = Math.max(1, Number.isFinite(sceneRadius) ? sceneRadius : 1)
  const budget = Math.max(3, Math.round(tier.starfieldCount))
  const counts = SHELL_COUNT_WEIGHT.map((weight) => Math.max(1, Math.round(budget * weight)))
  // 余数补在最远那层：抽稀不能让任何一层归零，但总数要对得上。
  const drift = budget - counts.reduce((sum, value) => sum + value, 0)
  counts[counts.length - 1] = Math.max(1, counts.at(-1)! + drift)
  return Object.freeze(SHELL_RADIUS_SCALE.map((scale, index) => Object.freeze({
    radius: base * scale,
    count: counts[index]!,
    alpha: Math.min(tier.starfieldPeakAlpha, SHELL_ALPHA[index]!),
    size: SHELL_SIZE[index]!,
  })))
}

/**
 * 谱型丰度。
 *
 * 真实主序星里 M 型约占七成、O/B 型不到千分之一。照抄这条分布，
 * 星场就自动是「以暖色为底、点缀几颗蓝白」，而不是一堆同色的点。
 */
const SPECTRAL_CLASSES = Object.freeze([
  Object.freeze({ kelvin: 3100, share: 0.62 }),
  Object.freeze({ kelvin: 4600, share: 0.20 }),
  Object.freeze({ kelvin: 5900, share: 0.10 }),
  Object.freeze({ kelvin: 7600, share: 0.05 }),
  Object.freeze({ kelvin: 11_500, share: 0.03 }),
])

export interface StarfieldLayerOptions {
  readonly radius: number
  readonly quality: Quality
  readonly reducedMotion: boolean
  readonly parent?: TransformNode
}

export interface StarfieldLayerDiagnostics {
  readonly batchCount: number
  readonly pointCount: number
  readonly colourSpread: number
  readonly twinkle: number
  readonly phaseOpacity: number
  readonly checksum: number
  readonly disposed: boolean
}

interface Batch {
  readonly mesh: Mesh
  readonly material: ShaderMaterial
  readonly geometry: Geometry
  readonly alpha: number
}

export class StarfieldLayer {
  private readonly batches: readonly Batch[]
  private readonly pointCount: number
  private readonly colourSpread: number
  private readonly checksum: number
  private twinkle: number
  private phaseOpacity = 1
  private disposed = false

  constructor(scene: Scene, options: StarfieldLayerOptions) {
    const tier = babylonUpliftTier(options.quality)
    const strata = starfieldStrata(tier, options.radius)
    this.twinkle = options.reducedMotion ? 0 : TWINKLE
    let total = 0
    let checksum = 0
    const warmths: number[] = []
    this.batches = strata.map((stratum, index) => {
      const random = xorshift32(0x5eed_0001 + index * 0x9e37)
      const positions = new Float32Array(stratum.count * 3)
      const colors = new Float32Array(stratum.count * 3)
      const sizes = new Float32Array(stratum.count)
      const seeds = new Float32Array(stratum.count)
      for (let point = 0; point < stratum.count; point += 1) {
        // 球面均匀采样：按 cosθ 均匀取，不是按 θ ——
        // 后者会把星星堆在两极，星场看起来像戴了顶帽子。
        const cosTheta = random() * 2 - 1
        const phi = random() * Math.PI * 2
        const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta))
        // 半径抖动：完全落在一个球壳上会在掠射角露出一条硬边。
        const radius = stratum.radius * (0.86 + random() * 0.28)
        positions[point * 3] = radius * sinTheta * Math.cos(phi)
        positions[point * 3 + 1] = radius * cosTheta
        positions[point * 3 + 2] = radius * sinTheta * Math.sin(phi)
        const kelvin = sampleSpectralKelvin(random())
        const [red, green, blue] = blackbodyRGB(kelvin)
        colors[point * 3] = red
        colors[point * 3 + 1] = green
        colors[point * 3 + 2] = blue
        warmths.push(red - blue)
        sizes[point] = stratum.size * (0.7 + random() * 0.6)
        seeds[point] = random() * 100
        checksum = (checksum + Math.round(radius * 13 + kelvin)) % 0xffff_ffff
      }
      total += stratum.count
      return this.createBatch(scene, index, stratum, positions, colors, sizes, seeds, options.parent)
    })
    this.pointCount = total
    this.colourSpread = spread(warmths)
    this.checksum = checksum
  }

  /** 相机进入恒星系或地层时星场退让，但保留底噪。 */
  setPhaseOpacity(opacity: number): void {
    if (this.disposed) return
    const finite = Number.isFinite(opacity) ? opacity : 1
    this.phaseOpacity = Math.min(1, Math.max(PHASE_OPACITY_FLOOR, finite))
    for (const { material } of this.batches) material.setFloat('uOpacity', this.phaseOpacity)
  }

  setReducedMotion(reduced: boolean): void {
    if (this.disposed) return
    this.twinkle = reduced ? 0 : TWINKLE
    for (const { material } of this.batches) material.setFloat('uTwinkle', this.twinkle)
  }

  update(elapsedMs: number, projectionScale: number): void {
    if (this.disposed) return
    const time = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0
    const scale = Number.isFinite(projectionScale) && projectionScale > 0 ? projectionScale : 500
    for (const { material } of this.batches) {
      material.setFloat('uTime', this.twinkle === 0 ? 0 : time)
      material.setFloat('uProjScale', scale)
    }
  }

  diagnostics(): StarfieldLayerDiagnostics {
    return Object.freeze({
      batchCount: this.batches.length,
      pointCount: this.pointCount,
      colourSpread: this.colourSpread,
      twinkle: this.twinkle,
      phaseOpacity: this.phaseOpacity,
      checksum: this.checksum,
      disposed: this.disposed,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const { mesh, material, geometry } of this.batches) {
      mesh.dispose(false, false)
      material.dispose()
      geometry.dispose()
    }
  }

  private createBatch(
    scene: Scene,
    index: number,
    stratum: StarfieldStratum,
    positions: Float32Array,
    colors: Float32Array,
    sizes: Float32Array,
    seeds: Float32Array,
    parent?: TransformNode,
  ): Batch {
    const mesh = new Mesh(`starfield:shell-${index}`, scene)
    mesh.parent = parent ?? null
    mesh.isPickable = false
    mesh.isUnIndexed = true
    mesh.alwaysSelectAsActiveMesh = true
    mesh.infiniteDistance = false
    const vertexData = new VertexData()
    vertexData.positions = positions
    vertexData.applyToMesh(mesh, false)
    const geometry = new Geometry(`starfield:shell-${index}:geometry`, scene, vertexData, false, mesh)
    geometry.setVerticesData('aColor', colors, false, 3)
    geometry.setVerticesData('aSize', sizes, false, 1)
    geometry.setVerticesData('aSeed', seeds, false, 1)

    const material = new ShaderMaterial(`starfield:shell-${index}:material`, scene, {
      vertexSource: VERTEX, fragmentSource: FRAGMENT,
    }, { attributes: ATTRIBUTES, uniforms: UNIFORMS, needAlphaBlending: true })
    material.fillMode = Constants.MATERIAL_PointFillMode
    material.alphaMode = Constants.ALPHA_ADD
    material.disableDepthWrite = true
    material.backFaceCulling = false
    material.setFloat('uTime', 0)
    material.setFloat('uTwinkle', this.twinkle)
    material.setFloat('uProjScale', 500)
    material.setFloat('uOpacity', 1)
    material.setFloat('uGain', stratum.alpha)
    mesh.material = material
    return { mesh, material, geometry, alpha: stratum.alpha }
  }
}

function sampleSpectralKelvin(sample: number): number {
  let cumulative = 0
  for (const { kelvin, share } of SPECTRAL_CLASSES) {
    cumulative += share
    if (sample <= cumulative) return kelvin
  }
  return SPECTRAL_CLASSES.at(-1)!.kelvin
}

function spread(values: readonly number[]): number {
  if (values.length === 0) return 0
  return Math.max(...values) - Math.min(...values)
}

function xorshift32(seed: number): () => number {
  let state = (seed >>> 0) || 0x9e37_79b9
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0
    return state / 0x1_0000_0000
  }
}
