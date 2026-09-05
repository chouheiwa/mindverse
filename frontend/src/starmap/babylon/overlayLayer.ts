import { Constants } from '@babylonjs/core/Engines/constants.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Geometry } from '@babylonjs/core/Meshes/geometry.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { Mode, Star, Universe } from '../../types'
import { ownerOpacity } from '../focusEmphasis'
import { DEPTH_FADE, ORBIT } from '../gl/chunks'
import { describeMode } from '../modeSemantics'
import { clusterAxis, orbitPeriod } from '../projection'
import type { Quality } from '../quality'

// 两种模式叠加物，都放进 3D 里 —— 它们得跟着相机走，也得吃到 bloom。
// 画在 2D 覆盖层上的发光物永远像贴纸。与 gl/overlay3d.ts 同构。
//
// 虫洞：旧版是一条屏幕空间的虚线加一个中点光斑。这里是沿贝塞尔曲线流动的
// 粒子流 —— 虫洞的语义是「你反复地从这个星群跨到那个星群」，流动本身就是
// 那个语义，虚线不是。
//
// 暗物质：中心什么都没有，只有引力透镜把背景掰弯 —— 这是这个概念唯一诚实的
// 画法。面片朝相机，因为透镜本来就是个视线现象。

export const WORMHOLE_SAMPLES = 190

/** 透镜只需要概念名、星群号与坐标。 */
type LensStar = Readonly<{ c: string, g: number, p: readonly [number, number, number] }>
const AMBER: readonly [number, number, number] = [1.0, 0.62, 0.24]
const WORM_GAIN = 2.6

/**
 * 粒子上限。
 *
 * Three 的全景相机停在 sceneRadius * 1.62 处，1/z 让这些精灵只有几个像素宽；
 * 这个渲染器的全景取景近得多，同一条公式没有封顶就会涨到几百像素，整屏糊成
 * 一团琥珀 —— 与 gl/dust.ts 给尘埃封顶是同一个理由。
 */
export const WORMHOLE_MAX_POINT_PX = 10

/** 与 overlayLayer 顶点着色器同式的 CPU 镜像。 */
export function wormholePointSize(pulse: number, projectionScale: number, viewZ: number): number {
  const requested = (1.6 + 4.6 * Math.max(0, pulse)) * (projectionScale / Math.max(1, viewZ)) * 0.55
  return Math.min(WORMHOLE_MAX_POINT_PX, Math.max(1, requested))
}

/** 曲线采样密度只随画质降低，图层本身永远存在。 */
const SAMPLE_DENSITY: Readonly<Record<Quality, number>> = Object.freeze({
  high: 1, medium: 0.7, low: 0.45,
})

const WORM_VERTEX = /* glsl */ `
precision highp float;
${DEPTH_FADE}
attribute vec3 position;
attribute float aT;
attribute float aWorm;
attribute float aFocus;
uniform mat4 worldView;
uniform mat4 projection;
uniform float uT;
uniform float uActive;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
varying float vAlpha;
void main(void) {
  vec4 mv = worldView * vec4(position, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projection * mv;

  float on = step(abs(aWorm - uActive), 0.5);
  // 三道脉冲沿曲线跑；尾部拖长，头部收紧
  float phase = fract(aT * 3.0 - uT * 0.00042);
  float pulse = pow(1.0 - phase, 5.0);
  float base = 0.16 + 0.84 * pulse;

  vAlpha = on * base * aFocus * depthFade(viewZ, uNear, uFar);
  gl_PointSize = clamp((1.6 + 4.6 * pulse) * (uProjScale / viewZ) * 0.55, 1.0, 10.0);
}
`

const WORM_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uGain;
varying float vAlpha;
void main(void) {
  if (vAlpha <= 0.003) discard;
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(offset, offset);
  if (d2 > 1.0) discard;
  float energy = exp(-d2 * 3.0) * vAlpha;
  gl_FragColor = vec4(uColor * energy * uGain, energy);
}
`

const DARK_VERTEX = /* glsl */ `
precision highp float;
${ORBIT}
${DEPTH_FADE}
attribute vec3 position;
attribute vec2 aCorner;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute float aPeriod;
attribute float aRadius;
attribute float aSeed;
attribute float aFocus;
uniform mat4 worldView;
uniform mat4 projection;
uniform float uT;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main(void) {
  vec3 orbited = orbitAround(position, aCenter, aAxis, aPeriod, uT * 0.001);
  vec4 mv = worldView * vec4(orbited, 1.0);
  float viewZ = max(1.0, -mv.z);
  mv.xy += aCorner * aRadius;
  gl_Position = projection * mv;
  vUv = aCorner;
  vSeed = aSeed;
  vAlpha = aFocus * depthFade(viewZ, uNear, uFar);
}
`

const DARK_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uT;
uniform float uEmphasis;
uniform vec3 uColor;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main(void) {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);
  float pulse = 0.85 + 0.15 * sin(uT * 0.00038 + vSeed);

  // 外圈：透镜的作用半径
  float halo = exp(-pow((r - 0.92) / 0.045, 2.0)) * 0.28;

  // 爱因斯坦环：两段相对的弧，中间是空的
  float arc = exp(-pow((r - 0.62) / 0.055, 2.0));
  float lobes = pow(max(0.0, abs(cos(ang))), 5.0);

  float a = (halo * 0.9 + arc * lobes * 1.5) * pulse * vAlpha * uEmphasis;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(mix(uColor, vec3(0.86, 0.90, 1.0), arc * lobes) * a, a);
}
`

/** 弧的中点：从 AB 连线朝「世界上方在垂直于 AB 的分量」抬起。 */
function arcMid(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
): [number, number, number] {
  const delta: [number, number, number] = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const length = Math.hypot(delta[0], delta[1], delta[2]) || 1
  const direction: [number, number, number] = [delta[0] / length, delta[1] / length, delta[2] / length]
  const alignment = direction[1]
  let normal: [number, number, number] = [
    -direction[0] * alignment, 1 - direction[1] * alignment, -direction[2] * alignment,
  ]
  let normalLength = Math.hypot(normal[0], normal[1], normal[2])
  if (normalLength < 1e-4) {
    // AB 恰好竖直：换一根参考轴
    normal = [1 - direction[0] * direction[0], -direction[1] * direction[0], -direction[2] * direction[0]]
    normalLength = Math.hypot(normal[0], normal[1], normal[2]) || 1
  }
  const height = length * 0.3
  return [
    (from[0] + to[0]) / 2 + (normal[0] / normalLength) * height,
    (from[1] + to[1]) / 2 + (normal[1] / normalLength) * height,
    (from[2] + to[2]) / 2 + (normal[2] / normalLength) * height,
  ]
}

/** 虫洞曲线上 t ∈ [0,1] 处的世界坐标（二次贝塞尔）。 */
export function wormholeCurvePoint(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const middle = arcMid(from, to)
  const inverse = 1 - t
  const w0 = inverse * inverse
  const w1 = 2 * inverse * t
  const w2 = t * t
  return [
    from[0] * w0 + middle[0] * w1 + to[0] * w2,
    from[1] * w0 + middle[1] * w1 + to[1] * w2,
    from[2] * w0 + middle[2] * w1 + to[2] * w2,
  ]
}

export interface OverlayLayerOptions {
  readonly quality: Quality
  readonly reducedMotion: boolean
  readonly parent?: TransformNode
}

export interface OverlayLayerDiagnostics {
  readonly wormholePointCount: number
  readonly darkLensCount: number
  readonly batchCount: number
  readonly wormholeVisible: boolean
  readonly darkVisible: boolean
  readonly activeWormhole: number
  readonly darkEmphasis: number
  readonly wormholeFocus: readonly number[]
  readonly darkFocus: readonly number[]
  readonly disposed: boolean
}

interface Batch {
  readonly mesh: Mesh
  readonly material: ShaderMaterial
  readonly geometry: Geometry
}

export class OverlayLayer {
  private readonly worm: Batch | null = null
  private readonly dark: Batch | null = null
  private readonly wormOwners: Int32Array
  private readonly wormFocus: Float32Array
  private readonly darkOwners: readonly string[]
  private readonly darkFocusValues: Float32Array
  private readonly samplesPerWormhole: number
  private activeWormhole = 0
  private darkEmphasisValue = 0.14
  private disposed = false

  constructor(scene: Scene, universe: Universe, options: OverlayLayerOptions) {
    const { quality, parent } = options
    const centers = new Map<number, readonly [number, number, number]>()
    for (const cluster of universe.clusters ?? []) centers.set(cluster.g, cluster.c)
    this.samplesPerWormhole = Math.max(
      8, Math.round(WORMHOLE_SAMPLES * (SAMPLE_DENSITY[quality] ?? 1)),
    )

    const positions: number[] = []
    const progress: number[] = []
    const indices: number[] = []
    const owners: number[] = []
    ;(universe.wormholes ?? []).forEach((wormhole, wormholeIndex) => {
      const from = centers.get(wormhole.a)
      const to = centers.get(wormhole.b)
      if (!from || !to) return
      for (let sample = 0; sample < this.samplesPerWormhole; sample += 1) {
        const t = sample / Math.max(1, this.samplesPerWormhole - 1)
        const point = wormholeCurvePoint(from, to, t)
        positions.push(point[0], point[1], point[2])
        progress.push(t)
        indices.push(wormholeIndex)
        owners.push(t < 0.5 ? wormhole.a : wormhole.b)
      }
    })
    this.wormOwners = Int32Array.from(owners)
    this.wormFocus = new Float32Array(owners.length).fill(1)

    if (owners.length > 0) {
      const geometry = new Geometry('overlay:wormhole:geometry', scene)
      geometry.setVerticesData('position', Float32Array.from(positions), false, 3)
      geometry.setVerticesData('aT', Float32Array.from(progress), false, 1)
      geometry.setVerticesData('aWorm', Float32Array.from(indices), false, 1)
      geometry.setVerticesData('aFocus', this.wormFocus, true, 1)
      const mesh = new Mesh('overlay:wormhole', scene)
      mesh.parent = parent ?? null
      mesh.isPickable = false
      mesh.isUnIndexed = true
      mesh.alwaysSelectAsActiveMesh = true
      mesh.setEnabled(false)
      geometry.applyToMesh(mesh)
      const material = new ShaderMaterial('overlay:wormhole:material', scene, {
        vertexSource: WORM_VERTEX, fragmentSource: WORM_FRAGMENT,
      }, {
        attributes: ['position', 'aT', 'aWorm', 'aFocus'],
        uniforms: ['worldView', 'projection', 'uT', 'uActive', 'uProjScale', 'uNear', 'uFar', 'uColor', 'uGain'],
        needAlphaBlending: true,
      })
      material.fillMode = Constants.MATERIAL_PointFillMode
      material.alphaMode = Constants.ALPHA_ADD
      material.disableDepthWrite = true
      material.setFloat('uT', 0)
      material.setFloat('uActive', 0)
      material.setFloat('uProjScale', 500)
      material.setFloat('uNear', 1)
      material.setFloat('uFar', 4000)
      material.setColor3Array?.('unused', [])
      material.setFloat('uGain', WORM_GAIN)
      material.setVector3?.('uColor', { x: AMBER[0], y: AMBER[1], z: AMBER[2] } as never)
      mesh.material = material
      this.worm = Object.freeze({ mesh, material, geometry })
    }

    const lenses = (universe.dark ?? []).flatMap((entry) => {
      const star = ((universe.stars ?? []) as readonly LensStar[]).find((candidate) => candidate.c === entry.c)
      return star ? [{ entry, star }] : []
    })
    this.darkOwners = lenses.flatMap(({ star }) => Array.from({ length: 6 }, () => star.c))
    this.darkFocusValues = new Float32Array(this.darkOwners.length).fill(1)

    if (lenses.length > 0) {
      const quad: readonly (readonly [number, number])[] = [
        [-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1],
      ]
      const darkPositions: number[] = []
      const corners: number[] = []
      const centersData: number[] = []
      const axes: number[] = []
      const periods: number[] = []
      const radii: number[] = []
      const seeds: number[] = []
      lenses.forEach(({ entry, star }, lensIndex) => {
        const cluster = (universe.clusters ?? []).find((candidate) => candidate.g === star.g)
        const center = cluster ? cluster.c : star.p
        const axis = clusterAxis(star.g)
        const period = cluster ? orbitPeriod(star.p, center) : 0
        const radius = 34 + entry.f * 2.2
        for (const [cornerX, cornerY] of quad) {
          darkPositions.push(star.p[0], star.p[1], star.p[2])
          corners.push(cornerX, cornerY)
          centersData.push(center[0], center[1], center[2])
          axes.push(axis[0], axis[1], axis[2])
          periods.push(period)
          radii.push(radius)
          seeds.push(lensIndex * 1.7 + entry.f)
        }
      })

      const geometry = new Geometry('overlay:dark:geometry', scene)
      geometry.setVerticesData('position', Float32Array.from(darkPositions), false, 3)
      geometry.setVerticesData('aCorner', Float32Array.from(corners), false, 2)
      geometry.setVerticesData('aCenter', Float32Array.from(centersData), false, 3)
      geometry.setVerticesData('aAxis', Float32Array.from(axes), false, 3)
      geometry.setVerticesData('aPeriod', Float32Array.from(periods), false, 1)
      geometry.setVerticesData('aRadius', Float32Array.from(radii), false, 1)
      geometry.setVerticesData('aSeed', Float32Array.from(seeds), false, 1)
      geometry.setVerticesData('aFocus', this.darkFocusValues, true, 1)
      const mesh = new Mesh('overlay:dark', scene)
      mesh.parent = parent ?? null
      mesh.isPickable = false
      mesh.isUnIndexed = true
      mesh.alwaysSelectAsActiveMesh = true
      geometry.applyToMesh(mesh)
      const material = new ShaderMaterial('overlay:dark:material', scene, {
        vertexSource: DARK_VERTEX, fragmentSource: DARK_FRAGMENT,
      }, {
        attributes: ['position', 'aCorner', 'aCenter', 'aAxis', 'aPeriod', 'aRadius', 'aSeed', 'aFocus'],
        uniforms: ['worldView', 'projection', 'uT', 'uNear', 'uFar', 'uEmphasis', 'uColor'],
        needAlphaBlending: true,
      })
      material.alphaMode = Constants.ALPHA_ADD
      material.backFaceCulling = false
      material.disableDepthWrite = true
      material.setFloat('uT', 0)
      material.setFloat('uNear', 1)
      material.setFloat('uFar', 4000)
      material.setFloat('uEmphasis', this.darkEmphasisValue)
      material.setVector3?.('uColor', { x: AMBER[0], y: AMBER[1], z: AMBER[2] } as never)
      mesh.material = material
      this.dark = Object.freeze({ mesh, material, geometry })
    }
  }

  setUniform(name: string, value: number): void {
    if (this.disposed) return
    for (const batch of this.batches()) batch.material.setFloat(name, value)
  }

  setMode(mode: Mode, universe: Universe, wormIndex: number): void {
    if (this.disposed) return
    const semantics = describeMode(mode, universe, wormIndex)
    this.activeWormhole = wormIndex
    this.worm?.material.setFloat('uActive', wormIndex)
    // 暗物质常驻，只是平时很淡 —— 它得一直在那儿，进了模式才被点亮。
    this.darkEmphasisValue = semantics.layers.darkMatter
    this.dark?.material.setFloat('uEmphasis', this.darkEmphasisValue)
    this.worm?.mesh.setEnabled(semantics.layers.wormholes > 0)
  }

  setFocus(star: Star | null): void {
    if (this.disposed) return
    const clusterId = star && 'g' in star ? (star as { g: number }).g : null
    for (let index = 0; index < this.wormFocus.length; index += 1) {
      this.wormFocus[index] = ownerOpacity(this.wormOwners[index]!, clusterId)
    }
    this.worm?.geometry.updateVerticesData('aFocus', this.wormFocus, false)
    const concept = star && 'c' in star ? (star as { c: string }).c : null
    for (let index = 0; index < this.darkFocusValues.length; index += 1) {
      this.darkFocusValues[index] = ownerOpacity(this.darkOwners[index]!, concept)
    }
    this.dark?.geometry.updateVerticesData('aFocus', this.darkFocusValues, false)
  }

  diagnostics(): OverlayLayerDiagnostics {
    return Object.freeze({
      wormholePointCount: this.wormOwners.length,
      darkLensCount: this.darkOwners.length / 6,
      batchCount: this.disposed ? 0 : this.batches().length,
      wormholeVisible: !this.disposed && this.worm?.mesh.isEnabled(false) === true,
      darkVisible: !this.disposed && this.dark !== null,
      activeWormhole: this.activeWormhole,
      darkEmphasis: this.darkEmphasisValue,
      wormholeFocus: Array.from(this.wormFocus),
      darkFocus: Array.from(this.darkFocusValues),
      disposed: this.disposed,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const batch of [this.worm, this.dark]) {
      if (!batch) continue
      batch.mesh.dispose(false, false)
      batch.material.dispose()
      batch.geometry.dispose()
    }
  }

  private batches(): readonly Batch[] {
    return [this.worm, this.dark].filter((batch): batch is Batch => batch !== null)
  }
}
