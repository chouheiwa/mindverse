import type { Material } from '@babylonjs/core/Materials/material.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Quaternion, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData.js'
import { createPlanetTerrainSource } from './planetTerrainSource'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import { initialPlanetLod, nextPlanetLod, type PlanetLod } from './planetLod'
import { planetWorldRadius } from '../gl/planetMaterials'
import type { PlanetSurfaceDescriptor } from './planetSurface'
import { describePlanetAppearance, type PlanetAppearance } from './planetAppearance'
import { planetInteractionRim } from './interactionFeedback'
import { babylonUpliftTier, type BabylonUpliftTier } from './visualUplift'
import type { Quality } from '../quality'
import { planetAtmosphereFragmentShader } from './shaders/planetAtmosphere.fragment.fx'
import { planetAtmosphereVertexShader } from './shaders/planetAtmosphere.vertex.fx'
import { planetFragmentShader } from './shaders/planet.fragment.fx'
import { planetVertexShader } from './shaders/planet.vertex.fx'

type SurfaceLevel = PlanetLod | 'lambert'
type SurfaceCompiler = (material: Material, level: PlanetLod, mesh: Mesh, signal: AbortSignal) => Promise<void>
type AtmosphereCompiler = (material: Material, mesh: Mesh, signal: AbortSignal) => Promise<void>

export interface PlanetVisualOptions {
  readonly scene: Scene
  readonly descriptor: PlanetSurfaceDescriptor
  readonly parent?: TransformNode
  readonly initialLod?: Exclude<PlanetLod, 'high'>
  readonly radiusScale?: number
  /** 画质分档：只降规格，不删外观类别（见 visualUplift）。 */
  readonly quality?: Quality
  readonly onError?: (cause: Error) => void
  readonly onMeshesChanged?: (visual: PlanetVisual) => void
  readonly compileSurface?: SurfaceCompiler
  readonly compileAtmosphere?: AtmosphereCompiler
}

export interface PlanetVisualUpdate {
  readonly elapsedMs: number
  readonly cameraPosition: Vector3
  readonly starPosition: Vector3
  /** 行星在屏幕上的投影半径（像素），与 Three 的 LOD 阶梯同一个量。 */
  readonly projectedRadiusPx: number
  readonly focused: boolean
}

const SURFACE_UNIFORMS = [
  'world', 'worldViewProjection', 'uTime', 'uSeed', 'uThermal', 'uThermalIce', 'uFreshness',
  'uCreated', 'uCollected', 'uSelected', 'uCraterDensity', 'uIncident', 'uReveal',
  'uCloudCoverage', 'uCloudSpeed', 'uNightLights', 'uSnowLine', 'uLavaGlow', 'uIceFracture',
  'uCraterVisibility', 'uCloudOctaves', 'uHovered', 'uInteractionRim', 'uInteractionColor',
  'uLightDirection', 'uCameraPosition',
] as const

const ATMOSPHERE_UNIFORMS = [
  'world', 'worldViewProjection', 'uPlanetCenter', 'uCameraPosition', 'uLightDirection', 'uRayleighColor',
  'uShellRadius', 'uDensity', 'uReveal', 'uQualityLevel',
] as const

const QUALITY_LEVEL: Readonly<Record<PlanetLod, 0 | 1 | 2>> = Object.freeze({ low: 0, medium: 1, high: 2 })

export class PlanetVisual {
  readonly descriptor: PlanetSurfaceDescriptor
  readonly appearance: PlanetAppearance
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
  private orbitGeometryLevel: PlanetLod | null = null
  private level: SurfaceLevel
  private focusBlend = 0
  private reveal = 0
  private visible = true
  private selected = false
  private hovered = false
  private atmosphereFallback = false
  private highUnavailable = false
  private disposed = false
  private readonly compilationAbort = new AbortController()
  private readonly lightScratch = new Vector3()
  private readonly uplift: BabylonUpliftTier

  constructor(options: PlanetVisualOptions) {
    this.scene = options.scene
    this.parent = options.parent
    this.descriptor = options.descriptor
    this.appearance = describePlanetAppearance(options.descriptor)
    this.uplift = babylonUpliftTier(options.quality ?? 'high')
    // 世界半径与 Three 实例同式（0.085 + 0.115·answerDensity）。descriptor.radius
    // 是 0.55–1 的归一化外观量，拿它乘一个常数当世界半径，会让同一颗行星比
    // 旧版大出将近一倍 —— 近景主体尺寸对不上的真正原因。
    this.radius = planetWorldRadius(options.descriptor.detailDensity) * (options.radiusScale ?? 1)
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
    this.applyInteractionRim()
  }

  /** 悬停反馈：暖色轮廓，说「这里可以点」。 */
  setHovered(hovered: boolean): void {
    if (this.disposed || this.hovered === hovered) return
    this.hovered = hovered
    if (this.level !== 'lambert') this.orbitMaterial.setFloat('uHovered', hovered ? 1 : 0)
    this.focusMaterial?.setFloat('uHovered', hovered ? 1 : 0)
    this.applyInteractionRim()
  }

  private applyInteractionRim(): void {
    const rim = planetInteractionRim(this.hovered ? 1 : 0, this.selected ? 1 : 0)
    const color = new Color3(rim.color[0], rim.color[1], rim.color[2])
    for (const material of [this.orbitMaterial, this.focusMaterial]) {
      if (!material || this.level === 'lambert') continue
      material.setFloat('uInteractionRim', rim.intensity)
      material.setColor3('uInteractionColor', color)
    }
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
      if (this.orbitGeometryLevel !== level) {
        this.configureSurfaceGeometry(this.orbitMesh, level)
        this.orbitGeometryLevel = level
      }
      this.configureSurfaceMaterial(this.orbitMaterial, level)
      this.disposeFocusResources()
    }
    this.applyPresentation()
    this.onMeshesChanged?.(this)
  }

  async ensureLod(requested: PlanetLod): Promise<void> {
    if (this.disposed) return
    const effectiveRequest = requested === 'high' && this.highUnavailable ? 'medium' : requested
    const chain: readonly PlanetLod[] = effectiveRequest === 'high'
      ? ['high', 'medium', 'low']
      : effectiveRequest === 'medium' ? ['medium', 'low'] : ['low']
    for (const level of chain) {
      if (this.disposed) return
      try {
        this.setLod(level)
        if (this.disposed) return
        const mesh = level === 'high' ? this.focusMesh : this.orbitMesh
        if (!mesh?.material) throw new Error(`Planet ${level} surface was not created`)
        await this.compileSurface(mesh.material, level, mesh, this.compilationAbort.signal)
        if (this.disposed) return
        if (level === 'high' && this.focusAtmosphereMesh?.material && !this.atmosphereFallback) {
          try {
            await this.compileAtmosphere(
              this.focusAtmosphereMesh.material,
              this.focusAtmosphereMesh,
              this.compilationAbort.signal,
            )
            if (this.disposed) return
          } catch (cause) {
            if (this.disposed) return
            this.atmosphereFallback = true
            this.atmosphereMesh.setEnabled(false)
            this.focusAtmosphereMesh.setEnabled(false)
            this.report(cause)
          }
        }
        return
      } catch (cause) {
        if (this.disposed) return
        if (level === 'high') this.highUnavailable = true
        this.report(cause)
      }
    }
    if (!this.disposed) this.installLambertFallback()
  }

  async ensureAtmosphere(): Promise<void> {
    if (this.disposed) return
    try {
      await this.compileAtmosphere(this.atmosphereMaterial, this.atmosphereMesh, this.compilationAbort.signal)
      if (this.disposed) return
    } catch (cause) {
      if (this.disposed) return
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
      : nextPlanetLod(this.level, input.projectedRadiusPx, focused)
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

  /**
   * 自转到某个绝对角度（绕本地 Y）。
   *
   * 与增量的 rotate 不同，这里是绝对量：自转由时钟单独驱动，不和别的来源叠加。
   * 拖动已经改成绕行星转相机，不再动网格，所以旋转四元数归自转独占。
   */
  setSpin(angle: number): void {
    if (!Number.isFinite(angle)) return
    const spin = Quaternion.RotationAxis(Vector3.Up(), angle)
    for (const mesh of this.meshes) mesh.rotationQuaternion = spin.clone()
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
    this.compilationAbort.abort()
    this.disposeFocusResources()
    this.orbitMesh.dispose(false, true)
    this.atmosphereMesh.dispose(false, true)
  }

  private createSurfaceMesh(suffix: string, level: PlanetLod): Mesh {
    const mesh = new Mesh(`planet:${this.descriptor.metadata.questionId}:${suffix}`, this.scene)
    this.configureSurfaceGeometry(mesh, level)
    if (suffix === 'orbit') this.orbitGeometryLevel = level
    mesh.parent = this.parent ?? null
    mesh.scaling.setAll(this.radius)
    mesh.isPickable = true
    mesh.metadata = { ...this.descriptor.metadata }
    const material = this.createSurfaceMaterial(`${mesh.name}:material`, level)
    mesh.material = material
    return mesh
  }

  private configureSurfaceGeometry(mesh: Mesh, level: PlanetLod): void {
    const data = VertexData.CreateIcoSphere({
      radius: 1, subdivisions: level === 'high' ? 12 : level === 'medium' ? 6 : 3, flat: false,
    })
    // 与可环绕地表世界共用同一个构造口 —— 两边必须是同一片地貌。
    const { field, displacement } = createPlanetTerrainSource(this.descriptor, level)
    const positions = data.positions!
    const normals = data.normals!
    const attributes = new Float32Array(positions.length / 3 * 4)
    // Icosphere face seams duplicate vertices; evaluate each direction only once.
    const samples = new Map<string, { height: number; normal: readonly number[]; signals: readonly number[] }>()
    for (let index = 0; index < positions.length; index += 3) {
      const length = Math.hypot(positions[index], positions[index + 1], positions[index + 2])
      const radial: [number, number, number] = [
        positions[index] / length, positions[index + 1] / length, positions[index + 2] / length,
      ]
      const key = radial.map((value) => value.toFixed(12)).join(',')
      let vertex = samples.get(key)
      if (!vertex) {
        const sample = field.sample(radial)
        vertex = {
          height: field.height(radial),
          normal: field.normal(radial, level === 'high' ? 0.006 : 0.012, displacement),
          signals: [sample.height, surfaceRelief(radial, this.descriptor),
            clamp01(sample.relief), clamp01(Math.max(sample.largeCraterMask, sample.smallCraterMask))],
        }
        samples.set(key, vertex)
      }
      for (let axis = 0; axis < 3; axis += 1) {
        positions[index + axis] = radial[axis] * (1 + vertex.height * displacement)
        normals[index + axis] = vertex.normal[axis]
      }
      attributes.set(vertex.signals, index / 3 * 4)
    }
    data.applyToMesh(mesh)
    mesh.setVerticesData('terrainData', attributes, false, 4)
    mesh.refreshBoundingInfo()
  }

  private createSurfaceMaterial(name: string, level: PlanetLod): ShaderMaterial {
    const material = new ShaderMaterial(name, this.scene, {
      vertexSource: planetVertexShader,
      fragmentSource: planetFragmentShader,
    }, {
      attributes: ['position', 'normal', 'terrainData'],
      uniforms: [...SURFACE_UNIFORMS],
      needAlphaBlending: true,
    })
    material.backFaceCulling = true
    this.configureSurfaceMaterial(material, level)
    return material
  }

  private configureSurfaceMaterial(material: ShaderMaterial, level: PlanetLod): void {
    material.setFloat('uTime', 0)
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
    material.setFloat('uHovered', this.hovered ? 1 : 0)
    const rim = planetInteractionRim(this.hovered ? 1 : 0, this.selected ? 1 : 0)
    material.setFloat('uInteractionRim', rim.intensity)
    material.setColor3('uInteractionColor', new Color3(rim.color[0], rim.color[1], rim.color[2]))
    material.setFloat('uSeed', this.descriptor.seed)
    material.setFloat('uCraterDensity', this.descriptor.craterCount / 48)
    material.setFloat('uIncident', this.descriptor.incident)
    material.setFloat('uReveal', 0)
    const appearance = this.appearance
    material.setFloat('uCloudCoverage', appearance.cloudCoverage)
    material.setFloat('uCloudSpeed', appearance.cloudSpeed)
    material.setFloat('uNightLights', appearance.nightLightDensity)
    material.setFloat('uSnowLine', appearance.snowLine)
    material.setFloat('uLavaGlow', appearance.lavaGlow)
    material.setFloat('uIceFracture', appearance.iceFracture)
    material.setFloat('uCraterVisibility', appearance.craterVisibility)
    // 云的八度按 LOD 分：远景一层足够读出「有云」，近景才需要涡。
    material.setInt('uCloudOctaves', level === 'high' ? this.uplift.planetCloudOctaves
      : Math.max(1, this.uplift.planetCloudOctaves - 1))
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

export function chooseInitialPlanetLod(projectedRadiusPx: number, focused: boolean): PlanetLod {
  return initialPlanetLod(projectedRadiusPx, focused)
}

const finite = (value: number): number => Number.isFinite(value) ? value : 0
const clamp01 = (value: number): number => Math.min(1, Math.max(0, finite(value)))

// Preserve the former vertex shader's independent material grain signal.
// Shape and normals exclusively use terrainField; this noise only modulates albedo.
function surfaceRelief(radial: readonly number[], descriptor: PlanetSurfaceDescriptor): number {
  const point = radial.map((value) => value * (14 + 10 * descriptor.detailDensity))
  const cell = point.map(Math.floor)
  const local = point.map((value, axis) => value - cell[axis])
  const fade = local.map((value) => value * value * (3 - 2 * value))
  const corner = (x: number, y: number, z: number): number => {
    const at = [cell[0] + x, cell[1] + y, cell[2] + z]
    const gradient = [[127.1, 311.7, 74.7], [269.5, 183.3, 246.1], [113.5, 271.9, 124.6]]
      .map((weights) => {
        const value = Math.sin(at.reduce((sum, value, axis) => sum + value * weights[axis], 0)
          + descriptor.seed * 0.000071) * 43758.5453123
        return (value - Math.floor(value)) * 2 - 1
      })
    const length = Math.hypot(...gradient) || 1
    return (gradient[0] * (local[0] - x) + gradient[1] * (local[1] - y)
      + gradient[2] * (local[2] - z)) / length
  }
  const mix = (a: number, b: number, t: number): number => a + (b - a) * t
  return mix(
    mix(mix(corner(0, 0, 0), corner(1, 0, 0), fade[0]),
      mix(corner(0, 1, 0), corner(1, 1, 0), fade[0]), fade[1]),
    mix(mix(corner(0, 0, 1), corner(1, 0, 1), fade[0]),
      mix(corner(0, 1, 1), corner(1, 1, 1), fade[0]), fade[1]), fade[2],
  ) * 0.9
}
