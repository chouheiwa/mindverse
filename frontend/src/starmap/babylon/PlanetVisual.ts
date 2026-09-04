import type { Material } from '@babylonjs/core/Materials/material.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Quaternion, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js'
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { initialPlanetLod, nextPlanetLod, type PlanetLod } from './planetLod'
import type { PlanetSurfaceDescriptor } from './planetSurface'
import { buildPlanetTerrain } from './planetTerrain'
import { planetAtmosphereFragmentShader } from './shaders/planetAtmosphere.fragment.fx'
import { planetAtmosphereVertexShader } from './shaders/planetAtmosphere.vertex.fx'
import { planetFragmentShader } from './shaders/planet.fragment.fx'
import { planetVertexShader } from './shaders/planet.vertex.fx'

type SurfaceLevel = PlanetLod | 'lambert'
type SurfaceCompiler = (material: Material, level: PlanetLod, mesh: Mesh) => Promise<void>
type AtmosphereCompiler = (material: Material, mesh: Mesh) => Promise<void>

export interface PlanetVisualOptions {
  readonly scene: Scene
  readonly descriptor: PlanetSurfaceDescriptor
  readonly parent?: TransformNode
  readonly initialLod?: Exclude<PlanetLod, 'high'>
  readonly radiusScale?: number
  readonly onError?: (cause: Error) => void
  readonly onMeshesChanged?: (visual: PlanetVisual) => void
  readonly compileSurface?: SurfaceCompiler
  readonly compileAtmosphere?: AtmosphereCompiler
}

export interface PlanetVisualUpdate {
  readonly elapsedMs: number
  readonly cameraPosition: Vector3
  readonly starPosition: Vector3
  readonly coverage: number
  readonly focused: boolean
}

const SURFACE_UNIFORMS = [
  'world', 'worldViewProjection', 'uTime', 'uDisplacement', 'uDetailDensity', 'uFaultStrength',
  'uWarpStrength', 'uNormalEpsilon', 'uSmallCraterThreshold', 'uSeed', 'uOctaves', 'uQualityLevel',
  'uLargeCraterCount', 'uLargeCraters', 'uLargeCraterShape', 'uThermal', 'uThermalIce', 'uFreshness',
  'uCreated', 'uCollected', 'uSelected', 'uCraterDensity', 'uIncident', 'uReveal',
  'uLightDirection', 'uCameraPosition',
] as const

const ATMOSPHERE_UNIFORMS = [
  'world', 'worldViewProjection', 'uPlanetCenter', 'uCameraPosition', 'uLightDirection', 'uRayleighColor',
  'uShellRadius', 'uDensity', 'uReveal', 'uQualityLevel',
] as const

const QUALITY_LEVEL: Readonly<Record<PlanetLod, number>> = Object.freeze({ low: 0, medium: 1, high: 2 })

export class PlanetVisual {
  readonly descriptor: PlanetSurfaceDescriptor
  readonly radius: number
  readonly orbitMesh: Mesh
  readonly atmosphereMesh: Mesh
  readonly atmosphereMaterial: ShaderMaterial
  focusMesh: Mesh | null = null

  private readonly scene: Scene
  private readonly parent?: TransformNode
  private readonly onError?: (cause: Error) => void
  private readonly onMeshesChanged?: (visual: PlanetVisual) => void
  private readonly compileSurface: SurfaceCompiler
  private readonly compileAtmosphere: AtmosphereCompiler
  private orbitMaterial: ShaderMaterial
  private focusMaterial: ShaderMaterial | null = null
  private focusAtmosphereMesh: Mesh | null = null
  private focusAtmosphereMaterial: ShaderMaterial | null = null
  private level: SurfaceLevel
  private focusBlend = 0
  private reveal = 0
  private visible = true
  private selected = false
  private atmosphereFallback = false
  private highUnavailable = false
  private disposed = false
  private readonly lightScratch = new Vector3()

  constructor(options: PlanetVisualOptions) {
    this.scene = options.scene
    this.parent = options.parent
    this.descriptor = options.descriptor
    this.radius = options.descriptor.radius * (options.radiusScale ?? 0.38)
    this.onError = options.onError
    this.onMeshesChanged = options.onMeshesChanged
    this.compileSurface = options.compileSurface
      ?? ((material, _level, mesh) => material.forceCompilationAsync(mesh))
    this.compileAtmosphere = options.compileAtmosphere
      ?? ((material, mesh) => material.forceCompilationAsync(mesh))
    this.level = options.initialLod ?? 'medium'

    this.orbitMesh = this.createSurfaceMesh('orbit', this.level)
    this.orbitMaterial = this.orbitMesh.material as ShaderMaterial
    const atmosphere = this.createAtmosphere('orbit')
    this.atmosphereMesh = atmosphere.mesh
    this.atmosphereMaterial = atmosphere.material
    this.applyPresentation()
  }

  get activeMesh(): Mesh {
    return this.focusMesh && this.focusBlend >= 0.5 ? this.focusMesh : this.orbitMesh
  }

  get minimumFocusRadiusMultiplier(): number {
    return this.highUnavailable ? 4.2 : 2.2
  }

  get surfaceMaterial(): Material {
    return this.activeMesh.material!
  }

  get meshes(): readonly Mesh[] {
    return [this.orbitMesh, this.atmosphereMesh, this.focusMesh, this.focusAtmosphereMesh]
      .filter((mesh): mesh is Mesh => mesh !== null)
  }

  setPosition(position: Vector3): void {
    for (const mesh of this.meshes) mesh.position.copyFrom(position)
  }

  focusTarget(): { x: number; y: number; z: number } {
    const position = this.activeMesh.position
    return { x: position.x, y: position.y, z: position.z }
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.applyPresentation()
  }

  setReveal(value: number): void {
    this.reveal = clamp01(value)
    this.applyReveal()
  }

  setSelected(selected: boolean): void {
    this.selected = selected
    if (this.level !== 'lambert') this.orbitMaterial.setFloat('uSelected', selected ? 1 : 0)
    this.focusMaterial?.setFloat('uSelected', selected ? 1 : 0)
  }

  setFocusBlend(value: number): void {
    this.focusBlend = clamp01(value)
    this.applyPresentation()
  }

  setLod(level: PlanetLod): void {
    if (this.disposed) return
    if (this.level === 'lambert') return
    if (level === 'high') {
      this.ensureFocusResources()
      this.level = 'high'
    } else {
      this.level = level
      this.configureSurfaceMaterial(this.orbitMaterial, level)
      this.disposeFocusResources()
    }
    this.applyPresentation()
    this.onMeshesChanged?.(this)
  }

  async ensureLod(requested: PlanetLod): Promise<void> {
    const effectiveRequest = requested === 'high' && this.highUnavailable ? 'medium' : requested
    const chain: readonly PlanetLod[] = effectiveRequest === 'high'
      ? ['high', 'medium', 'low']
      : effectiveRequest === 'medium' ? ['medium', 'low'] : ['low']
    for (const level of chain) {
      try {
        this.setLod(level)
        const mesh = level === 'high' ? this.focusMesh : this.orbitMesh
        if (!mesh?.material) throw new Error(`Planet ${level} surface was not created`)
        await this.compileSurface(mesh.material, level, mesh)
        if (level === 'high' && this.focusAtmosphereMesh?.material && !this.atmosphereFallback) {
          try {
            await this.compileAtmosphere(this.focusAtmosphereMesh.material, this.focusAtmosphereMesh)
          } catch (cause) {
            this.atmosphereFallback = true
            this.atmosphereMesh.setEnabled(false)
            this.focusAtmosphereMesh.setEnabled(false)
            this.report(cause)
          }
        }
        return
      } catch (cause) {
        if (level === 'high') this.highUnavailable = true
        this.report(cause)
      }
    }
    this.installLambertFallback()
  }

  async ensureAtmosphere(): Promise<void> {
    try {
      await this.compileAtmosphere(this.atmosphereMaterial, this.atmosphereMesh)
    } catch (cause) {
      this.atmosphereFallback = true
      this.atmosphereMesh.setEnabled(false)
      this.focusAtmosphereMesh?.setEnabled(false)
      this.report(cause)
    }
  }

  update(input: PlanetVisualUpdate): boolean {
    if (!this.visible || !this.activeMesh.isEnabled() || this.disposed) return false
    if (this.scene.frustumPlanes.length > 0 && !this.activeMesh.isInFrustum(this.scene.frustumPlanes)) return false
    const focused = input.focused
    const next = this.level === 'lambert'
      ? 'lambert'
      : nextPlanetLod(this.level, input.coverage, focused)
    if (next !== 'lambert' && next !== this.level) void this.ensureLod(next)

    this.lightScratch.copyFrom(input.starPosition).subtractInPlace(this.activeMesh.position)
    if (this.lightScratch.lengthSquared() < 1e-8) this.lightScratch.set(0, 1, 0)
    else this.lightScratch.normalize()
    const surfaceMaterials = this.level === 'lambert' ? [] : [this.orbitMaterial, this.focusMaterial]
    for (const material of surfaceMaterials) {
      material?.setFloat('uTime', finite(input.elapsedMs))
      material?.setVector3('uLightDirection', this.lightScratch)
      material?.setVector3('uCameraPosition', input.cameraPosition)
    }
    for (const material of [this.atmosphereMaterial, this.focusAtmosphereMaterial]) {
      material?.setVector3('uPlanetCenter', this.activeMesh.position)
      material?.setVector3('uLightDirection', this.lightScratch)
      material?.setVector3('uCameraPosition', input.cameraPosition)
    }
    return true
  }

  rotate(yawDelta: number, pitchDelta: number): void {
    if (!Number.isFinite(yawDelta) || !Number.isFinite(pitchDelta)) return
    const yaw = Quaternion.RotationAxis(Vector3.Up(), yawDelta)
    const pitch = Quaternion.RotationAxis(Vector3.Right(), pitchDelta)
    for (const mesh of this.meshes) {
      if (!mesh.rotationQuaternion) mesh.rotationQuaternion = Quaternion.FromEulerAngles(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z)
      mesh.rotationQuaternion = yaw.multiply(pitch).multiply(mesh.rotationQuaternion)
    }
  }

  diagnostics(): Readonly<{
    surfaceLevel: SurfaceLevel
    surfaceFallback: boolean
    atmosphereFallback: boolean
    rotation: readonly [number, number, number, number]
    thermalDominant: keyof PlanetSurfaceDescriptor['thermal']
    highFrequencyDetail: boolean
  }> {
    const rotation = this.activeMesh.rotationQuaternion ?? Quaternion.Identity()
    return Object.freeze({
      surfaceLevel: this.level,
      surfaceFallback: this.level === 'lambert',
      atmosphereFallback: this.atmosphereFallback,
      rotation: Object.freeze([rotation.x, rotation.y, rotation.z, rotation.w] as const),
      thermalDominant: (Object.entries(this.descriptor.thermal) as [keyof PlanetSurfaceDescriptor['thermal'], number][])
        .reduce((best, entry) => entry[1] > best[1] ? entry : best)[0],
      highFrequencyDetail: this.level === 'high'
        && this.focusMesh?.isEnabled() === true
        && this.focusMaterial?.isReady(this.focusMesh) === true,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.disposeFocusResources()
    this.orbitMesh.dispose(false, true)
    this.atmosphereMesh.dispose(false, true)
  }

  private createSurfaceMesh(suffix: string, level: PlanetLod): Mesh {
    const mesh = CreateIcoSphere(`planet:${this.descriptor.metadata.questionId}:${suffix}`, {
      radius: 1,
      subdivisions: level === 'high' ? 12 : level === 'medium' ? 6 : 3,
      flat: false,
    }, this.scene)
    mesh.parent = this.parent ?? null
    mesh.scaling.setAll(this.radius)
    mesh.isPickable = true
    mesh.metadata = { ...this.descriptor.metadata }
    const material = this.createSurfaceMaterial(`${mesh.name}:material`, level)
    mesh.material = material
    return mesh
  }

  private createSurfaceMaterial(name: string, level: PlanetLod): ShaderMaterial {
    const material = new ShaderMaterial(name, this.scene, {
      vertexSource: planetVertexShader,
      fragmentSource: planetFragmentShader,
    }, {
      attributes: ['position', 'normal'],
      uniforms: [...SURFACE_UNIFORMS],
      needAlphaBlending: true,
    })
    material.backFaceCulling = true
    this.configureSurfaceMaterial(material, level)
    return material
  }

  private configureSurfaceMaterial(material: ShaderMaterial, level: PlanetLod): void {
    const terrain = buildPlanetTerrain(this.descriptor, level)
    material.setFloat('uTime', 0)
    material.setFloat('uDisplacement', 0.045 + this.descriptor.detailDensity * 0.08)
    material.setFloat('uDetailDensity', this.descriptor.detailDensity)
    material.setFloat('uFaultStrength', this.descriptor.faultStrength)
    material.setFloat('uWarpStrength', terrain.warpStrength)
    material.setFloat('uNormalEpsilon', level === 'high' ? 0.006 : 0.012)
    material.setFloat('uSmallCraterThreshold', terrain.smallCraterThreshold)
    material.setInt('uOctaves', terrain.octaves)
    material.setInt('uQualityLevel', QUALITY_LEVEL[level])
    material.setInt('uLargeCraterCount', terrain.largeCraters.length)
    const craterVectors = terrain.largeCraters.flatMap(({ direction, radius }) => [...direction, radius])
    const craterShapes = terrain.largeCraters.flatMap(({ depth, rim }) => [depth, rim, 0, 0])
    while (craterVectors.length < 32) craterVectors.push(0)
    while (craterShapes.length < 32) craterShapes.push(0)
    material.setArray4('uLargeCraters', craterVectors)
    material.setArray4('uLargeCraterShape', craterShapes)
    material.setVector4('uThermal', new Vector4(
      this.descriptor.thermal.magma,
      this.descriptor.thermal.desert,
      this.descriptor.thermal.rock,
      this.descriptor.thermal.tundra,
    ))
    material.setFloat('uThermalIce', this.descriptor.thermal.ice)
    material.setFloat('uFreshness', this.descriptor.atmosphere)
    material.setFloat('uCreated', this.descriptor.createdGlow)
    material.setFloat('uCollected', this.descriptor.collectedMarker)
    material.setFloat('uSelected', this.selected ? 1 : 0)
    material.setFloat('uSeed', this.descriptor.seed)
    material.setFloat('uCraterDensity', this.descriptor.craterCount / 48)
    material.setFloat('uIncident', this.descriptor.incident)
    material.setFloat('uReveal', 0)
  }

  private createAtmosphere(suffix: string): { mesh: Mesh; material: ShaderMaterial } {
    const mesh = CreateIcoSphere(`planet:${this.descriptor.metadata.questionId}:${suffix}:atmosphere`, {
      radius: 1,
      subdivisions: suffix === 'focus' ? 5 : 3,
      flat: false,
    }, this.scene)
    mesh.parent = this.parent ?? null
    const shellRadius = this.radius * (1.095 + this.descriptor.atmosphere * 0.025)
    mesh.scaling.setAll(shellRadius)
    mesh.isPickable = false
    mesh.metadata = { ...this.descriptor.metadata }
    const material = new ShaderMaterial(`${mesh.name}:material`, this.scene, {
      vertexSource: planetAtmosphereVertexShader,
      fragmentSource: planetAtmosphereFragmentShader,
    }, {
      attributes: ['position', 'normal'],
      uniforms: [...ATMOSPHERE_UNIFORMS],
      needAlphaBlending: true,
    })
    material.backFaceCulling = false
    material.disableDepthWrite = true
    material.setColor3('uRayleighColor', new Color3(0.24, 0.48, 0.82))
    material.setFloat('uShellRadius', shellRadius)
    material.setFloat('uDensity', 0.20 + this.descriptor.atmosphere * 0.22)
    material.setFloat('uReveal', 0)
    material.setInt('uQualityLevel', suffix === 'focus' ? 2 : QUALITY_LEVEL[this.level === 'lambert' ? 'low' : this.level])
    mesh.material = material
    return { mesh, material }
  }

  private ensureFocusResources(): void {
    if (this.focusMesh) return
    this.focusMesh = this.createSurfaceMesh('focus', 'high')
    this.focusMesh.position.copyFrom(this.orbitMesh.position)
    this.focusMaterial = this.focusMesh.material as ShaderMaterial
    const atmosphere = this.createAtmosphere('focus')
    this.focusAtmosphereMesh = atmosphere.mesh
    this.focusAtmosphereMesh.position.copyFrom(this.orbitMesh.position)
    this.focusAtmosphereMaterial = atmosphere.material
    this.onMeshesChanged?.(this)
  }

  private disposeFocusResources(): void {
    this.focusMesh?.dispose(false, true)
    this.focusAtmosphereMesh?.dispose(false, true)
    this.focusMesh = null
    this.focusMaterial = null
    this.focusAtmosphereMesh = null
    this.focusAtmosphereMaterial = null
  }

  private installLambertFallback(): void {
    this.disposeFocusResources()
    const material = new StandardMaterial(`planet:${this.descriptor.metadata.questionId}:lambert`, this.scene)
    const thermal = this.descriptor.thermal
    material.diffuseColor = new Color3(
      thermal.magma * 0.48 + thermal.desert * 0.62 + thermal.rock * 0.22 + thermal.tundra * 0.24 + thermal.ice * 0.52,
      thermal.magma * 0.045 + thermal.desert * 0.29 + thermal.rock * 0.25 + thermal.tundra * 0.34 + thermal.ice * 0.72,
      thermal.magma * 0.008 + thermal.desert * 0.075 + thermal.rock * 0.28 + thermal.tundra * 0.37 + thermal.ice * 0.86,
    )
    material.specularColor = Color3.Black()
    this.orbitMesh.material?.dispose()
    this.orbitMesh.material = material
    this.level = 'lambert'
    this.applyPresentation()
  }

  private applyPresentation(): void {
    const focusVisible = this.visible && !!this.focusMesh && this.focusBlend > 0
    const orbitVisible = this.visible && (!this.focusMesh || this.focusBlend < 1)
    this.orbitMesh.setEnabled(orbitVisible)
    this.orbitMesh.isPickable = orbitVisible
    this.atmosphereMesh.setEnabled(orbitVisible && !this.atmosphereFallback)
    if (this.focusMesh) {
      this.focusMesh.setEnabled(focusVisible)
      this.focusMesh.isPickable = focusVisible
    }
    this.focusAtmosphereMesh?.setEnabled(focusVisible && !this.atmosphereFallback)
    this.applyReveal()
  }

  private applyReveal(): void {
    if (this.level !== 'lambert') this.orbitMaterial.setFloat('uReveal', this.reveal * (1 - this.focusBlend))
    this.atmosphereMaterial.setFloat('uReveal', this.reveal * (1 - this.focusBlend))
    this.focusMaterial?.setFloat('uReveal', this.reveal * this.focusBlend)
    this.focusAtmosphereMaterial?.setFloat('uReveal', this.reveal * this.focusBlend)
  }

  private report(cause: unknown): void {
    this.onError?.(cause instanceof Error ? cause : new Error(String(cause)))
  }
}

export function chooseInitialPlanetLod(coverage: number, focused: boolean): PlanetLod {
  return initialPlanetLod(coverage, focused)
}

const finite = (value: number): number => Number.isFinite(value) ? value : 0
const clamp01 = (value: number): number => Math.min(1, Math.max(0, finite(value)))
