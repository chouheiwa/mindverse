import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import type { Scene } from '@babylonjs/core/scene'
import type { Vec3 } from './cubeSphere'
import type { ThermalWeights } from './planetSurface'
import { thermalGroundAlbedo, thermalHorizonColor } from './planetSky'
import { planetGroundVertexShader } from './shaders/planetGround.vertex.fx'
import { planetGroundFragmentShader } from './shaders/planetGround.fragment.fx'

export interface PlanetGroundOptions {
  radius: number
  thermal: ThermalWeights
  seed?: number
}

export const PLANET_GROUND_UNIFORMS = [
  'worldViewProjection', 'world', 'uSunDirection', 'uCameraPosition', 'uPlanetCenter',
  'uPlanetRadius', 'uBaseColor', 'uAccentColor', 'uRockColor', 'uHorizonColor', 'uSeed', 'uDetailStrength',
] as const

const clamp01 = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
const finite = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback
function direction(value: Vec3): Vector3 {
  const scale = Math.max(...value.map((component) => Math.abs(finite(component, 0))))
  if (!value.every(Number.isFinite) || scale < 1e-12) return Vector3.Up()
  return new Vector3(value[0] / scale, value[1] / scale, value[2] / scale).normalize()
}
const color = (value: Vec3): Vector3 => new Vector3(clamp01(value[0]), clamp01(value[1]), clamp01(value[2]))

/**
 * 地表材质：噪声岩理、坡向露岩、太阳明暗、远处的地平线雾。
 *
 * 几何仍在 CPU（地形场是唯一真源）；这里的噪声只调制外观，不需要跨端一致。
 */
export class PlanetGround {
  readonly material: ShaderMaterial
  private base: Vec3 = [0.3, 0.3, 0.3]
  private accent: Vec3 = [0.4, 0.4, 0.4]
  private rock: Vec3 = [0.2, 0.2, 0.2]
  private disposed = false

  constructor(scene: Scene, options: PlanetGroundOptions) {
    this.material = new ShaderMaterial('planet-ground:material', scene, {
      vertexSource: planetGroundVertexShader, fragmentSource: planetGroundFragmentShader,
    }, { attributes: ['position', 'normal'], uniforms: [...PLANET_GROUND_UNIFORMS] })
    this.material.backFaceCulling = true
    this.material.setFloat('uDetailStrength', 0.42)
    this.material.setFloat('uSeed', finite(options.seed ?? 0, 0) % 1000)
    this.setThermal(options.thermal)
    this.setSun([0, 1, 0])
    this.setCamera([0, 0, 0], [0, 0, 0], options.radius)
  }

  setSun(value: Vec3): void {
    if (this.disposed) return
    this.material.setVector3('uSunDirection', direction(value))
  }

  /** 相机与行星：雾按到相机的距离、坡向按到星心的方向算。 */
  setCamera(cameraPosition: Vec3, planetCenter: Vec3, radius: number): void {
    if (this.disposed) return
    this.material.setVector3('uCameraPosition', new Vector3(
      finite(cameraPosition[0], 0), finite(cameraPosition[1], 0), finite(cameraPosition[2], 0)))
    this.material.setVector3('uPlanetCenter', new Vector3(
      finite(planetCenter[0], 0), finite(planetCenter[1], 0), finite(planetCenter[2], 0)))
    this.material.setFloat('uPlanetRadius', Number.isFinite(radius) && radius > 0 ? radius : 1)
  }

  setThermal(weights: ThermalWeights): void {
    if (this.disposed) return
    const base = thermalGroundAlbedo(weights)
    const horizon = thermalHorizonColor(weights)
    this.base = base
    this.accent = [base[0] * 1.22 + 0.06, base[1] * 1.2 + 0.05, base[2] * 1.16 + 0.04]
    this.rock = [base[0] * 0.5 + 0.02, base[1] * 0.5 + 0.02, base[2] * 0.52 + 0.03]
    this.material.setVector3('uBaseColor', color(this.base))
    this.material.setVector3('uAccentColor', color(this.accent))
    this.material.setVector3('uRockColor', color(this.rock))
    this.material.setVector3('uHorizonColor', color(horizon))
  }

  isReady(): boolean {
    return !this.disposed && this.material.isReady()
  }

  warm(mesh?: AbstractMesh): Promise<boolean> {
    // Metal 实测 472 帧中最差 2086.5ms，其余 <= 14.2ms；303 块地形与首次编译挤在同帧。
    // 延后触发编译，让调用方先拿到 Promise，才能在进入地表前安排预热。
    return Promise.resolve().then(async () => {
      if (this.disposed) return false
      const compile = this.material.forceCompilationAsync as ((mesh?: AbstractMesh) => Promise<void>) | undefined
      if (typeof compile !== 'function') return this.isReady()
      await compile.call(this.material, mesh)
      return true
    }).catch(() => false)
  }

  diagnostics(): Readonly<{ base: Vec3; accent: Vec3; rock: Vec3; disposed: boolean; ready: boolean }> {
    return { base: [...this.base], accent: [...this.accent], rock: [...this.rock], disposed: this.disposed, ready: this.isReady() }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.material.dispose()
  }
}
