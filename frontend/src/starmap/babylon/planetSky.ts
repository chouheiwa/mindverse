import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Scene } from '@babylonjs/core/scene'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Observer } from '@babylonjs/core/Misc/observable'
import type { Vec3 } from './cubeSphere'
import type { ThermalWeights } from './planetSurface'
import { planetSkyVertexShader } from './shaders/planetSky.vertex.fx'
import { planetSkyFragmentShader } from './shaders/planetSky.fragment.fx'

export interface PlanetSkyOptions {
  radius?: number
  thermal?: ThermalWeights
  dim?: number
}

export const PLANET_SKY_UNIFORMS = [
  'worldViewProjection', 'uUp', 'uSunDirection', 'uZenithColor',
  'uHorizonColor', 'uSunColor', 'uDim',
] as const

const ROCK: ThermalWeights = { magma: 0, desert: 0, rock: 1, tundra: 0, ice: 0 }
// 与地表热型保持同族色相；降低天顶亮度才能让地平线的空气厚度可读。
const PALETTE: Record<keyof ThermalWeights, Vec3> = {
  magma: [0.9, 0.24, 0.08], desert: [0.76, 0.42, 0.10],
  rock: [0.31, 0.34, 0.40], tundra: [0.20, 0.46, 0.39], ice: [0.42, 0.70, 0.96],
}
const clamp01 = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
function direction(value: Vec3): Vector3 {
  const scale = Math.max(...value.map(Math.abs))
  if (!value.every(Number.isFinite) || scale < 1e-12) return Vector3.Up()
  // 先缩放，避免极大但有限的输入在求长度时溢出。
  return new Vector3(value[0] / scale, value[1] / scale, value[2] / scale).normalize()
}

export class PlanetSky {
  readonly mesh: Mesh
  readonly material: ShaderMaterial
  private readonly scene: Scene
  private readonly drawObserver: Observer<Scene>
  private readonly radius: number
  private disposed = false
  private dim = 1
  private sun = Vector3.Up()
  private up = Vector3.Up()
  private zenith = Vector3.Zero()
  private horizon = Vector3.Zero()
  private sunColor = Vector3.One()

  constructor(scene: Scene, parent: TransformNode, options: PlanetSkyOptions = {}) {
    this.scene = scene
    this.radius = Number.isFinite(options.radius) && options.radius! > 0
      ? Math.min(1e6, Math.max(0.01, options.radius!)) : 100
    this.mesh = CreateSphere('planet-sky', { diameter: 2, segments: 32, sideOrientation: Mesh.BACKSIDE }, scene)
    // 不继承行星或相机旋转，否则转动视角时太阳会黏在屏幕上。
    this.mesh.isPickable = false
    this.mesh.layerMask = 0
    this.material = new ShaderMaterial('planet-sky-material', scene, {
      vertexSource: planetSkyVertexShader, fragmentSource: planetSkyFragmentShader,
    }, { attributes: ['position'], uniforms: [...PLANET_SKY_UNIFORMS], needAlphaBlending: true })
    this.material.disableDepthWrite = true
    this.material.backFaceCulling = true
    this.mesh.material = this.material
    this.setSun([0, 1, 0])
    this.material.setVector3('uUp', this.up)
    this.setThermal(options.thermal ?? ROCK)
    this.setDim(options.dim ?? 1)
    // 常规透明队列会排在地表之后；单独预绘制才能保证天空先画且不污染深度。
    this.drawObserver = scene.onBeforeDrawPhaseObservable.add(() => {
      const camera = scene.activeCamera
      if (this.disposed || !camera || !this.mesh.isVisible || !parent.isEnabled()) return
      this.mesh.position.copyFrom(camera.globalPosition)
      const center = parent.getAbsolutePosition()
      const radial = camera.globalPosition.subtract(center)
      this.up = direction([radial.x, radial.y, radial.z])
      this.material.setVector3('uUp', this.up)
      // 球壳必须落在相机裁剪范围内，短远裁剪距离的近景也需要完整天空。
      const near = Math.max(0.001, camera.minZ)
      const far = camera.maxZ > near ? camera.maxZ : Math.max(this.radius * 2, near * 4)
      this.mesh.scaling.setAll(Math.min(far * 0.9, Math.max(near * 2, this.radius)))
      this.mesh.computeWorldMatrix(true)
      for (const subMesh of this.mesh.subMeshes) this.mesh.render(subMesh, true)
    })
  }

  setSun(value: Vec3): void {
    if (this.disposed) return
    this.sun = direction(value)
    this.material.setVector3('uSunDirection', this.sun)
  }

  setThermal(weights: ThermalWeights): void {
    if (this.disposed) return
    const keys = Object.keys(PALETTE) as (keyof ThermalWeights)[]
    const safe = keys.map(key => clamp01(weights[key]))
    const total = safe.reduce((sum, value) => sum + value, 0)
    this.horizon = Vector3.Zero()
    keys.forEach((key, i) => {
      const weight = total > 1e-8 ? safe[i]! / Math.max(total, 1e-8) : Number(key === 'rock')
      this.horizon.addInPlace(Vector3.FromArray(PALETTE[key]).scale(weight))
    })
    this.zenith = this.horizon.multiply(new Vector3(0.12, 0.18, 0.3))
    this.sunColor = Vector3.Lerp(this.horizon, Vector3.One(), 0.65)
    this.material.setVector3('uZenithColor', this.zenith)
    this.material.setVector3('uHorizonColor', this.horizon)
    this.material.setVector3('uSunColor', this.sunColor)
  }

  setDim(value: number): void {
    if (this.disposed) return
    this.dim = clamp01(value)
    this.mesh.isVisible = this.dim > 0
    this.material.setFloat('uDim', this.dim)
  }

  diagnostics() {
    return { disposed: this.disposed, visible: !this.disposed && this.mesh.isVisible,
      dim: this.dim, sun: this.sun.asArray(), up: this.up.asArray(),
      zenith: this.zenith.asArray(), horizon: this.horizon.asArray(), sunColor: this.sunColor.asArray(),
      uniforms: [...PLANET_SKY_UNIFORMS] }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.scene.onBeforeDrawPhaseObservable.remove(this.drawObserver)
    this.mesh.dispose()
    this.material.dispose()
  }
}
