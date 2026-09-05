import { Constants } from '@babylonjs/core/Engines/constants.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { ProceduralTexture } from '@babylonjs/core/Materials/Textures/Procedurals/proceduralTexture.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { FBM, SIMPLEX3 } from '../gl/chunks'
import type { PaletteRgb } from '../nebulaPalette'
import type { BabylonCinematicEnvironment } from './cinematic'

// 星际气体：三层不同半径的球壳 + 一枚星系核心。
//
// 与 gl/nebula.ts 同构，参数逐字对齐。
//
// 为什么是三层壳而不是一张背景图：贴图会「贴着屏幕滑」，壳层是真的待在
// 世界坐标里，相机一动内壳掠过的角度就比外壳大，视差自己就出来了。
//
// 为什么烘焙进 cube map 而不是每帧算：域扭曲 fbm 单像素要跑三十来次 simplex，
// 全屏逐帧算是两位数毫秒起步。这里用 Babylon 的 ProceduralTexture 把六个面
// 各渲一次（`refreshRate = 0`），之后每帧只剩一次 textureCube 采样。

export interface NebulaShellConfig {
  readonly r: number
  readonly freq: number
  readonly warp: number
  readonly low: number
  readonly high: number
  readonly flat: number
  readonly dust: number
  readonly spin: number
}

/** 半径倍率、噪声频率、亮度、自转速度（弧度/秒），与 gl/nebula.ts 的 SHELLS 同值。 */
export const NEBULA_SHELLS: readonly NebulaShellConfig[] = Object.freeze([
  Object.freeze({ r: 1.00, freq: 3.4, warp: 1.10, low: 0.10, high: 0.62, flat: 1.45, dust: 0.55, spin: 0.0042 }),
  Object.freeze({ r: 1.62, freq: 2.3, warp: 0.85, low: 0.16, high: 0.70, flat: 1.05, dust: 0.38, spin: 0.0026 }),
  Object.freeze({ r: 2.45, freq: 1.5, warp: 0.55, low: 0.24, high: 0.80, flat: 0.72, dust: 0.20, spin: 0.0015 }),
])

/** 核心相对星系半径的直径；与 gl/scene.ts 的 NEBULA_CORE_DIAMETER_SCALE 同值。 */
export const NEBULA_CORE_DIAMETER_SCALE = 2.25

/**
 * 曝光校准。
 *
 * 壳层增益逐字取自 gl/cinematic.ts，但同一组线性值在两条管线里落点不同：
 * Three 烘进 HalfFloat 立方体贴图并走 postprocessing 的 Neutral 曲线，
 * Babylon 烘进 8 位贴图并走 KHR PBR Neutral（exposure 0.92）。这个标量补的是管线差，
 * 不是参数差，所以三组有出处的增益本身不动。
 *
 * 视场从 0.8 rad 对齐到 Three 的 60° 之后重新标定过一次：更宽的镜头会看到
 * 更多两极的稀薄区域，同样的增益下非背景占比反而掉到 Three 的 0.63 倍。
 */
export const NEBULA_EXPOSURE = 0.78

/** Three 的全景相机距离 = sceneRadius * 1.62（见 Renderer 的 targetDist）。 */
export const PANORAMA_DISTANCE_SCALE = 1.62

/**
 * 由全景相机距离反推背景尺度。
 *
 * 星云与星系核心是按**张角**读出来的，不是按世界尺寸 —— 用星群包围盒当尺度，
 * 单星宇宙里相机会停在 19 个单位处却对着一枚 135 单位宽的核心盘，
 * 整屏就糊成一层均匀的奶白。锚在相机距离上，两个渲染器的张角才一致。
 */
export function backgroundRadiusFor(panoramaDistance: number): number {
  const distance = Number.isFinite(panoramaDistance) && panoramaDistance > 0 ? panoramaDistance : 1
  return distance / PANORAMA_DISTANCE_SCALE
}

const BAKE_FRAGMENT = /* glsl */ `
precision highp float;
${SIMPLEX3}
${FBM}
uniform float face;
uniform float uFreq, uWarp, uLow, uHigh, uFlat, uDust, uSeed;
uniform vec3 uColA, uColB, uColC;
varying vec2 vUV;

/** 立方体贴图取样方向的逆映射，与 GL 的面序一致，跨面连续无缝。 */
vec3 faceDirection(float index, vec2 uv) {
  float u = uv.x * 2.0 - 1.0;
  float v = uv.y * 2.0 - 1.0;
  if (index < 0.5) return vec3(1.0, -v, -u);
  if (index < 1.5) return vec3(-1.0, -v, u);
  if (index < 2.5) return vec3(u, 1.0, v);
  if (index < 3.5) return vec3(u, -1.0, -v);
  if (index < 4.5) return vec3(u, -v, 1.0);
  return vec3(-u, -v, -1.0);
}

void main(void) {
  vec3 d = normalize(faceDirection(face, vUV));
  vec3 q = d * uFreq + uSeed;

  float n = warpedFbm(q, uWarp);
  float m = smoothstep(uLow, uHigh, n);

  // 两条独立的噪声通道决定色相，否则整片星云只有一个颜色
  float c1 = clamp(fbm(q * 1.63 + 7.0) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(uColA, uColB, c1);
  col = mix(col, uColC, smoothstep(0.34, 0.95, n));

  // 尘埃带：真星系都有的暗痕，靠减法而不是画一条黑条
  float dust = smoothstep(0.15, 0.75, fbm(q * 2.6 - 13.0));
  m *= 1.0 - uDust * dust;

  // 盘是扁的：赤道浓、两极稀
  float band = exp(-pow(d.y * uFlat, 2.0));
  m *= mix(0.18, 1.0, band);

  gl_FragColor = vec4(col * m, 1.0);
}
`

const SHELL_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec3 vDir;
void main(void) {
  vDir = position;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

const SHELL_FRAGMENT = /* glsl */ `
precision highp float;
uniform samplerCube uMap;
uniform float uGain;
varying vec3 vDir;
void main(void) {
  gl_FragColor = vec4(textureCube(uMap, normalize(vDir)).rgb * uGain, 1.0);
}
`

const CORE_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUv;
void main(void) {
  vUv = uv;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`

const CORE_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uTint;
uniform float uGain;
varying vec2 vUv;
void main(void) {
  // 扁的：星系核心是个透视中的盘，不是球
  vec2 p = (vUv - 0.5) * vec2(2.0, 5.2);
  float d = length(p);
  float halo = exp(-d * 2.6) * 0.16 + exp(-d * 7.5) * 0.40;
  gl_FragColor = vec4(mix(uTint, vec3(1.0), 0.45) * halo * uGain, 1.0);
}
`

export interface NebulaLayerOptions {
  readonly radius: number
  readonly palette: readonly PaletteRgb[]
  readonly environment: BabylonCinematicEnvironment
  readonly parent?: TransformNode
}

export interface NebulaLayerDiagnostics {
  readonly shellCount: number
  readonly coreCount: number
  readonly meshCount: number
  readonly shellRadii: readonly number[]
  readonly shellRotations: readonly (readonly [number, number, number])[]
  readonly bakedTextureCount: number
  readonly refreshRates: readonly number[]
  readonly perFrameNoise: boolean
  readonly bakeSize: number
  readonly gains: readonly number[]
  readonly shellBackFaceCulling: readonly boolean[]
  readonly shellSideOrientation: readonly number[]
  readonly disposed: boolean
}

interface Shell {
  readonly mesh: Mesh
  readonly material: ShaderMaterial
  readonly texture: ProceduralTexture
  readonly spin: number
  readonly index: number
  readonly baseGain: number
}

export class NebulaLayer {
  private readonly shells: readonly Shell[]
  private readonly core: Mesh
  private readonly coreMaterial: ShaderMaterial
  private readonly coreBaseGain: number
  private readonly bakeSize: number
  private dim = 1
  private disposed = false

  constructor(scene: Scene, options: NebulaLayerOptions) {
    const { radius, palette, environment, parent } = options
    this.bakeSize = environment.nebulaBake
    this.coreBaseGain = environment.coreGain * NEBULA_EXPOSURE
    const tint = (index: number): PaletteRgb => palette[index] ?? palette[0] ?? [0.6, 0.7, 1]

    this.shells = NEBULA_SHELLS.map((config, index) => {
      const texture = new ProceduralTexture(
        `nebula:shell:${index}:bake`, environment.nebulaBake, { fragmentSource: BAKE_FRAGMENT },
        scene, null, false, true,
      )
      texture.setFloat('uFreq', config.freq)
      texture.setFloat('uWarp', config.warp)
      texture.setFloat('uLow', config.low)
      texture.setFloat('uHigh', config.high)
      texture.setFloat('uFlat', config.flat)
      texture.setFloat('uDust', config.dust)
      texture.setFloat('uSeed', 3.7 + index * 17.3)
      texture.setColor3('uColA', color3(tint(0)))
      texture.setColor3('uColB', color3(tint(1)))
      texture.setColor3('uColC', color3(tint(2)))
      // REFRESHRATE_RENDER_ONCE — the whole point of baking.
      texture.refreshRate = 0

      const material = new ShaderMaterial(`nebula:shell:${index}:material`, scene, {
        vertexSource: SHELL_VERTEX, fragmentSource: SHELL_FRAGMENT,
      }, {
        attributes: ['position'],
        uniforms: ['worldViewProjection', 'uGain'],
        samplers: ['uMap'],
        needAlphaBlending: true,
      })
      material.setTexture('uMap', texture)
      material.setFloat('uGain', (environment.shellGain[index] ?? 0) * NEBULA_EXPOSURE)
      material.alphaMode = Constants.ALPHA_ADD
      // 相机在壳内，只画远侧那一面。两面都画等于把星云叠加两遍，
      // 全景会从「有结构的深空」糊成一层均匀奶白。
      material.backFaceCulling = true
      material.sideOrientation = Mesh.BACKSIDE
      material.disableDepthWrite = true
      material.forceDepthWrite = false

      // 半边长 = radius * r * 11：相机最远 4.6R，必须始终待在内层壳里面
      const mesh = CreateBox(
        `nebula:shell:${index}`, { size: 1, sideOrientation: Mesh.BACKSIDE }, scene,
      )
      mesh.parent = parent ?? null
      mesh.material = material
      mesh.isPickable = false
      mesh.infiniteDistance = false
      mesh.alwaysSelectAsActiveMesh = true
      mesh.scaling.setAll(radius * config.r * 22)
      mesh.renderingGroupId = 0
      // 每层给一个固定的初始朝向，否则三层的结构会对齐成同心花纹
      mesh.rotation.set(index * 1.31, index * 2.17, index * 0.73)

      return Object.freeze({
        mesh, material, texture, spin: config.spin, index,
        baseGain: (environment.shellGain[index] ?? 0) * NEBULA_EXPOSURE,
      })
    })

    // 星系核心：真的钉在原点，所以它会随相机正确地视差，而不是永远糊在屏幕中央
    this.coreMaterial = new ShaderMaterial('nebula:core:material', scene, {
      vertexSource: CORE_VERTEX, fragmentSource: CORE_FRAGMENT,
    }, {
      attributes: ['position', 'uv'],
      uniforms: ['worldViewProjection', 'uTint', 'uGain'],
      needAlphaBlending: true,
    })
    this.coreMaterial.setColor3('uTint', color3(tint(1)))
    this.coreMaterial.setFloat('uGain', this.coreBaseGain)
    this.coreMaterial.alphaMode = Constants.ALPHA_ADD
    this.coreMaterial.backFaceCulling = false
    this.coreMaterial.disableDepthWrite = true

    const coreSize = radius * NEBULA_CORE_DIAMETER_SCALE
    this.core = CreatePlane('nebula:core', { size: coreSize }, scene)
    this.core.parent = parent ?? null
    this.core.material = this.coreMaterial
    this.core.isPickable = false
    this.core.alwaysSelectAsActiveMesh = true
    this.core.billboardMode = Mesh.BILLBOARDMODE_ALL
  }

  /** @param seconds 绝对时间；按绝对角度赋值，累加会随帧率漂移。 */
  update(seconds: number): void {
    if (this.disposed) return
    const time = Number.isFinite(seconds) ? seconds : 0
    for (const shell of this.shells) {
      shell.mesh.rotation.set(
        shell.index * 1.31,
        shell.index * 2.17 + time * shell.spin,
        shell.index * 0.73,
      )
    }
  }

  /**
   * 非全景模式与聚焦时整体退让。
   *
   * 星云按方向采样、亮度与距离无关 —— 飞进一个恒星系之后画面上只剩几个天体，
   * 它就成了压倒性的奶白底。它是背景，靠近时必须退场。
   */
  setDim(value: number): void {
    if (this.disposed) return
    this.dim = Number.isFinite(value) ? Math.max(0, value) : 1
    for (const shell of this.shells) shell.material.setFloat('uGain', shell.baseGain * this.dim)
    this.coreMaterial.setFloat('uGain', this.coreBaseGain * this.dim)
  }

  diagnostics(): NebulaLayerDiagnostics {
    return Object.freeze({
      shellCount: this.shells.length,
      coreCount: this.disposed ? 0 : 1,
      meshCount: this.shells.length + (this.disposed ? 0 : 1),
      shellRadii: this.shells.map(({ mesh }) => mesh.scaling.x),
      shellRotations: this.shells.map(({ mesh }) =>
        Object.freeze([mesh.rotation.x, mesh.rotation.y, mesh.rotation.z] as const)),
      bakedTextureCount: this.shells.length,
      refreshRates: this.shells.map(({ texture }) => texture.refreshRate),
      perFrameNoise: this.shells.some(({ texture }) => texture.refreshRate > 0),
      bakeSize: this.bakeSize,
      gains: [
        ...this.shells.map(({ baseGain }) => baseGain * this.dim),
        this.coreBaseGain * this.dim,
      ],
      shellBackFaceCulling: this.shells.map(({ material }) => material.backFaceCulling),
      shellSideOrientation: this.shells.map(({ material }) => material.sideOrientation ?? Mesh.BACKSIDE),
      disposed: this.disposed,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    for (const shell of this.shells) {
      shell.mesh.dispose(false, false)
      shell.material.dispose()
      shell.texture.dispose()
    }
    this.core.dispose(false, false)
    this.coreMaterial.dispose()
  }
}

function color3(tint: PaletteRgb): Color3 {
  return new Color3(tint[0], tint[1], tint[2])
}
