import { Constants } from '@babylonjs/core/Engines/constants.js'
import { Color3 } from '@babylonjs/core/Maths/math.color.js'
import { Material } from '@babylonjs/core/Materials/material.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { Geometry } from '@babylonjs/core/Meshes/geometry.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import type { Scene } from '@babylonjs/core/scene.js'
import type { StarDatum } from '../gl/starData'
import type { Quality } from '../quality'
import { starIdentity } from '../starIdentity'
import type { StarPresentation } from './starPresentation'
import { describeStarVisual, type StarVisualDescriptor } from './starVisualDescriptor'
import { starCoreFragmentShader } from './shaders/starCore.fragment.fx'
import { starCoronaFragmentShader } from './shaders/starCorona.fragment.fx'
import { starFlareFragmentShader } from './shaders/starFlare.fragment.fx'
import { starHaloFragmentShader } from './shaders/starHalo.fragment.fx'
import { starPanoramaVertexShader } from './shaders/starPanorama.vertex.fx'
import { starSurfaceFragmentShader } from './shaders/starSurface.fragment.fx'
import { starSurfaceVertexShader } from './shaders/starSurface.vertex.fx'

export interface StarLayerFrameInput {
  readonly elapsedMs: number
  readonly renderHeight: number
  readonly devicePixelRatio: number
  readonly projectionScale: number
}

export interface StellarCompileTarget {
  readonly material: Material
  readonly mesh: Mesh
}

export type StellarCompilePort = (
  kind: 'advanced' | 'fallback',
  targets: readonly StellarCompileTarget[],
  succeed: () => void,
  fail: (cause: Error) => void,
) => void

export interface StarLayerOptions {
  readonly parent?: TransformNode
  readonly onError?: (cause: Error) => void
  /** Narrow dependency seam for deterministic shader-compiler failure tests. */
  readonly compile?: StellarCompilePort
}

export interface StarLayerDiagnostics {
  readonly panoramaBatchCount: number
  readonly panoramaGeometryCount: number
  readonly panoramaMeshIds: readonly number[]
  readonly panoramaMaterialIds: readonly number[]
  readonly focusedPairCount: number
  readonly focusedMeshIds: readonly number[]
  readonly focusedVisible: boolean
  readonly starOrder: readonly string[]
  readonly dimensions: readonly number[]
  readonly interactions: readonly (readonly [number, number, number])[]
  readonly quality: Readonly<{ sphereSegments: number; noiseOctaves: number; coronaLayers: number }>
  readonly stellarShaderFallback: boolean
  readonly focusedReady: boolean
  readonly focusUniforms: Readonly<{
    kelvin: number; seed: number; rot: number; activity: number; time: number
  }>
  readonly disposed: boolean
}

const QUALITY_CONFIG = Object.freeze({
  high: Object.freeze({ sphereSegments: 48, noiseOctaves: 4, coronaLayers: 2 }),
  medium: Object.freeze({ sphereSegments: 32, noiseOctaves: 3, coronaLayers: 2 }),
  low: Object.freeze({ sphereSegments: 20, noiseOctaves: 2, coronaLayers: 1 }),
} satisfies Record<Quality, StarLayerDiagnostics['quality']>)

const PANORAMA_ATTRIBUTES = [
  'position', 'aCenter', 'aAxis', 'aColor', 'aPeriod', 'aCoreSize', 'aHaloSize',
  'aBright', 'aBurst', 'aSeed', 'aRot', 'aBodyR', 'aDim', 'aCoreDim', 'aHaloDim',
  'aInteraction',
]
const PANORAMA_UNIFORMS = [
  'worldView', 'projection', 'uTime', 'uBobAmplitude', 'uRenderHeight',
  'uDevicePixelRatio', 'uProjectionScale', 'uLayer', 'uCoreScale',
  'uCoreBrightness', 'uHaloIntensity', 'uPanoramaAlpha', 'uHaloAlpha',
  'uFlareThreshold', 'uFlareAlpha',
]
const CORONA_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUV;
void main(void) { vUV = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }
`
const FALLBACK_SURFACE_VERTEX = /* glsl */ `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform vec3 cameraPosition;
varying vec3 vNormal;
varying vec3 vViewDirection;
void main(void) {
  vec3 worldPosition = (world * vec4(position, 1.0)).xyz;
  vNormal = normalize(mat3(world) * normal);
  vViewDirection = cameraPosition - worldPosition;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}
`
const FALLBACK_SURFACE_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uSurfaceAlpha;
varying vec3 vNormal;
varying vec3 vViewDirection;
void main(void) {
  float facing = max(0.0, dot(normalize(vNormal), normalize(vViewDirection)));
  float limb = 0.34 + 0.66 * pow(facing, 0.58);
  vec3 hotCore = mix(uColor, vec3(1.0), 0.64);
  vec3 analyticCore = hotCore * min(2.2, 0.72 + limb * 1.18);
  gl_FragColor = vec4(analyticCore, clamp(uSurfaceAlpha, 0.0, 1.0));
}
`
const FALLBACK_CORONA_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uCoronaAlpha;
uniform float uCoronaIntensity;
varying vec2 vUV;
void main(void) {
  float radius = length(vUV * 2.0 - 1.0);
  if (radius > 1.0) discard;
  float ring = smoothstep(0.28, 0.38, radius) * pow(max(0.0, 1.0 - radius), 2.4);
  gl_FragColor = vec4(uColor * uCoronaIntensity, ring * uCoronaAlpha * 0.72);
}
`

interface PanoramaBatch {
  readonly mesh: Mesh
  readonly material: ShaderMaterial
  readonly layer: number
}

export class StarLayer {
  private readonly stars: readonly StarDatum[]
  private readonly descriptors: readonly StarVisualDescriptor[]
  private readonly descriptorByDatum: ReadonlyMap<StarDatum, StarVisualDescriptor>
  private readonly reducedMotion: boolean
  private readonly options: StarLayerOptions
  private readonly qualityConfig: StarLayerDiagnostics['quality']
  private readonly geometry: Geometry
  private readonly panorama: readonly PanoramaBatch[]
  private readonly dimensionsBuffer: Float32Array
  private readonly baseDimensions: Float32Array
  private readonly interactionBuffer: Float32Array
  private readonly coreDimensionsBuffer: Float32Array
  private readonly haloDimensionsBuffer: Float32Array
  private readonly focusSphere: Mesh
  private readonly focusCorona: Mesh
  private focusedMaterials: Material[] = []
  private focusedDatum: StarDatum | null = null
  private focusedKey: string | null = null
  private presentation: StarPresentation | null = null
  private hoverKey: string | null = null
  private pressedKey: string | null = null
  private fallbackActive = false
  private fallbackFailed = false
  private advancedFailure: Error | null = null
  private focusedKind: 'advanced' | 'fallback' = 'advanced'
  private compileGeneration = 0
  private fallbackScheduled = false
  private focusedReady = false
  private disposed = false
  private focusUniforms = { kelvin: 0, seed: 0, rot: 0, activity: 0, time: 0 }

  constructor(
    scene: Scene,
    stars: readonly StarDatum[],
    quality: Quality,
    reducedMotion: boolean,
    options: StarLayerOptions = {},
  ) {
    this.stars = stars
    this.descriptors = stars.map(describeStarVisual)
    this.descriptorByDatum = new Map(stars.map((datum, index) => [datum, this.descriptors[index]!]))
    this.reducedMotion = reducedMotion
    this.options = options
    this.qualityConfig = QUALITY_CONFIG[quality]
    this.dimensionsBuffer = new Float32Array(stars.length).fill(1)
    this.baseDimensions = new Float32Array(stars.length).fill(1)
    this.interactionBuffer = new Float32Array(stars.length * 3).fill(1)
    this.coreDimensionsBuffer = new Float32Array(stars.length).fill(1)
    this.haloDimensionsBuffer = new Float32Array(stars.length).fill(1)
    this.geometry = createPanoramaGeometry(
      scene, stars, this.descriptors, this.dimensionsBuffer, this.coreDimensionsBuffer,
      this.haloDimensionsBuffer, this.interactionBuffer,
    )
    this.panorama = [
      this.createPanoramaBatch(scene, 'core', starCoreFragmentShader, 0),
      this.createPanoramaBatch(scene, 'halo', starHaloFragmentShader, 1),
      this.createPanoramaBatch(scene, 'flare', starFlareFragmentShader, 2),
    ]

    this.focusSphere = CreateSphere('stellar:focus:surface', {
      diameter: 2, segments: this.qualityConfig.sphereSegments,
    }, scene)
    this.focusCorona = CreatePlane('stellar:focus:corona', { size: 2 }, scene)
    for (const mesh of [this.focusSphere, this.focusCorona]) {
      mesh.parent = options.parent ?? null
      mesh.isPickable = false
      mesh.setEnabled(false)
    }
    this.focusCorona.billboardMode = Mesh.BILLBOARDMODE_ALL
    this.installAdvancedFocusedMaterials(scene)
  }

  setDimensions(values: readonly number[]): void {
    if (this.disposed) return
    if (values.length !== this.stars.length) {
      throw new RangeError(`Expected ${this.stars.length} star dimensions, received ${values.length}`)
    }
    for (let index = 0; index < this.dimensionsBuffer.length; index += 1) {
      const value = values[index]
      this.baseDimensions[index] = Number.isFinite(value) ? Math.min(1, Math.max(0, value as number)) : 1
      this.dimensionsBuffer[index] = this.baseDimensions[index]!
    }
    this.geometry.updateVerticesData('aDim', this.dimensionsBuffer, false)
    this.applyPresentationDimensions()
  }

  setFocus(starKey: string | null, datum: StarDatum | null): void {
    if (this.disposed) return
    this.focusedKey = starKey
    this.focusedDatum = datum
    if (datum) this.applyFocusDatum(datum)
    this.applyVisibility()
    this.applyPresentationDimensions()
  }

  setPresentation(presentation: StarPresentation, hoverKey: string | null, pressedKey: string | null): void {
    if (this.disposed) return
    this.presentation = presentation
    this.hoverKey = hoverKey
    this.pressedKey = pressedKey
    const wholeLayerAlpha = presentation.lodIntent === 'hidden' ? 0 : 1
    this.panorama[0]?.material.setFloat('uPanoramaAlpha', wholeLayerAlpha)
    this.panorama[0]?.material.setFloat('uCoreScale', 1)
    this.panorama[0]?.material.setFloat('uCoreBrightness', 1)
    this.panorama[1]?.material.setFloat('uPanoramaAlpha', wholeLayerAlpha)
    this.panorama[1]?.material.setFloat('uHaloIntensity', 1)
    this.panorama[2]?.material.setFloat('uPanoramaAlpha', wholeLayerAlpha)
    this.applyFocusedPresentationUniforms()
    this.applyVisibility()
    this.applyInteractions()
    this.applyPresentationDimensions()
  }

  update(input: StarLayerFrameInput): void {
    if (this.disposed) return
    const time = this.reducedMotion ? 0 : finiteNonNegative(input.elapsedMs)
    const renderHeight = Math.max(1, finiteNonNegative(input.renderHeight))
    const dpr = Math.max(1, finiteNonNegative(input.devicePixelRatio))
    const projectionScale = Math.max(1, finiteNonNegative(input.projectionScale))
    for (const { material } of this.panorama) {
      material.setFloat('uTime', time)
      material.setFloat('uRenderHeight', renderHeight)
      material.setFloat('uDevicePixelRatio', dpr)
      material.setFloat('uProjectionScale', projectionScale)
    }
    if (!this.focusedDatum) return
    const datum = this.focusedDatum
    safeStarWorldPosition(datum, time, this.reducedMotion ? 0 : 1.35, this.focusSphere.position)
    this.focusCorona.position.copyFrom(this.focusSphere.position)
    this.focusUniforms = { ...this.focusUniforms, time }
    for (const material of this.focusedMaterials) {
      if (material instanceof ShaderMaterial) material.setFloat('uTime', time)
    }
  }

  diagnostics(): StarLayerDiagnostics {
    return Object.freeze({
      panoramaBatchCount: this.panorama.length,
      panoramaGeometryCount: 1,
      panoramaMeshIds: Object.freeze(this.panorama.map(({ mesh }) => mesh.uniqueId)),
      panoramaMaterialIds: Object.freeze(this.panorama.map(({ material }) => material.uniqueId)),
      focusedPairCount: 1,
      focusedMeshIds: Object.freeze([this.focusSphere.uniqueId, this.focusCorona.uniqueId]),
      focusedVisible: this.focusSphere.isEnabled() || this.focusCorona.isEnabled(),
      starOrder: Object.freeze(this.stars.map(({ s }) => starIdentity(s))),
      dimensions: Object.freeze(Array.from(this.dimensionsBuffer)),
      interactions: Object.freeze(Array.from({ length: this.stars.length }, (_, index) => Object.freeze([
        rounded(this.interactionBuffer[index * 3]!),
        rounded(this.interactionBuffer[index * 3 + 1]!),
        rounded(this.interactionBuffer[index * 3 + 2]!),
      ] as const))),
      quality: this.qualityConfig,
      stellarShaderFallback: this.fallbackActive,
      focusedReady: this.focusedReady,
      focusUniforms: Object.freeze({ ...this.focusUniforms }),
      disposed: this.disposed,
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.compileGeneration += 1
    this.fallbackScheduled = false
    this.focusedReady = false
    for (const { mesh, material } of this.panorama) {
      mesh.dispose(false, false)
      material.dispose()
    }
    this.geometry.dispose()
    this.focusSphere.dispose(false, false)
    this.focusCorona.dispose(false, false)
    for (const material of this.focusedMaterials) material.dispose()
    this.focusedMaterials = []
  }

  private createPanoramaBatch(scene: Scene, name: string, fragmentSource: string, layer: number): PanoramaBatch {
    const mesh = new Mesh(`stellar:panorama:${name}`, scene)
    mesh.parent = this.options.parent ?? null
    mesh.isPickable = false
    mesh.isUnIndexed = true
    mesh.alwaysSelectAsActiveMesh = true
    this.geometry.applyToMesh(mesh)
    const material = new ShaderMaterial(`stellar:panorama:${name}:material`, scene, {
      vertexSource: starPanoramaVertexShader, fragmentSource,
    }, { attributes: PANORAMA_ATTRIBUTES, uniforms: PANORAMA_UNIFORMS, needAlphaBlending: true })
    material.fillMode = Constants.MATERIAL_PointFillMode
    material.alphaMode = Constants.ALPHA_ADD
    material.disableDepthWrite = layer !== 0
    material.setFloat('uLayer', layer)
    material.setFloat('uTime', 0)
    material.setFloat('uBobAmplitude', this.reducedMotion ? 0 : 1.35)
    material.setFloat('uRenderHeight', 1000)
    material.setFloat('uDevicePixelRatio', 1)
    material.setFloat('uProjectionScale', 500)
    material.setFloat('uCoreScale', 1)
    material.setFloat('uCoreBrightness', 1)
    material.setFloat('uHaloIntensity', 1)
    material.setFloat('uPanoramaAlpha', 1)
    material.setFloat('uHaloAlpha', 1)
    material.setFloat('uFlareThreshold', 2.0)
    material.setFloat('uFlareAlpha', 1)
    mesh.material = material
    return { mesh, material, layer }
  }

  private installAdvancedFocusedMaterials(scene: Scene): void {
    const surface = new ShaderMaterial('stellar:focus:surface:advanced', scene, {
      vertexSource: starSurfaceVertexShader, fragmentSource: starSurfaceFragmentShader,
    }, {
      attributes: ['position', 'normal'],
      uniforms: ['worldViewProjection', 'world', 'cameraPosition', 'uColor', 'uKelvin', 'uSeed', 'uRot', 'uActivity', 'uTime', 'uSurfaceAlpha'],
      defines: [`#define STAR_NOISE_OCTAVES ${this.qualityConfig.noiseOctaves}`],
      needAlphaBlending: true,
    })
    const corona = createCoronaMaterial(scene, 'advanced', starCoronaFragmentShader)
    surface.alphaMode = Constants.ALPHA_COMBINE
    surface.disableDepthWrite = true
    corona.alphaMode = Constants.ALPHA_ADD
    corona.disableDepthWrite = true
    this.focusedMaterials = [surface, corona]
    this.focusSphere.material = surface
    this.focusCorona.material = corona
    this.focusedKind = 'advanced'
    this.startFocusedCompilation('advanced', [
      { material: surface, mesh: this.focusSphere },
      { material: corona, mesh: this.focusCorona },
    ])
  }

  private activateFallback(advancedCause: Error): void {
    if (this.disposed || this.focusedKind !== 'advanced') return
    this.advancedFailure = advancedCause
    this.fallbackActive = false
    this.focusedReady = false
    this.focusedKind = 'fallback'
    const scene = this.focusSphere.getScene()
    const oldMaterials = this.focusedMaterials
    const surface = createFallbackSurfaceMaterial(scene)
    const corona = createCoronaMaterial(scene, 'fallback', FALLBACK_CORONA_FRAGMENT)
    corona.alphaMode = Constants.ALPHA_ADD
    corona.disableDepthWrite = true
    this.focusedMaterials = [surface, corona]
    this.focusSphere.material = surface
    this.focusCorona.material = corona
    for (const material of oldMaterials) material.dispose()
    if (this.focusedDatum) this.applyFocusDatum(this.focusedDatum)
    this.applyFocusedPresentationUniforms()
    this.startFocusedCompilation('fallback', [
      { material: surface, mesh: this.focusSphere },
      { material: corona, mesh: this.focusCorona },
    ])
  }

  private failFallback(cause: Error): void {
    if (this.fallbackFailed || this.disposed) return
    this.fallbackFailed = true
    this.focusSphere.setEnabled(false)
    this.focusCorona.setEnabled(false)
    const original = this.advancedFailure ?? cause
    if (original !== cause && !('cause' in original)) {
      try {
        Object.defineProperty(original, 'cause', { value: cause, configurable: true })
      } catch {
        // Error identity is more important than optional metadata on frozen host errors.
      }
    }
    this.options.onError?.(original)
  }

  private applyFocusDatum(datum: StarDatum): void {
    const descriptor = this.descriptorByDatum.get(datum) ?? describeStarVisual(datum)
    const color = new Color3(descriptor.color[0], descriptor.color[1], descriptor.color[2])
    const bodyRadius = clampFinite(datum.bodyR, 0.3, 0.01, 10)
    const kelvin = clampFinite(datum.kelvin, 5778, 1000, 50_000)
    const rotation = finiteOr(datum.rot, 0)
    this.focusSphere.scaling.setAll(bodyRadius)
    this.focusCorona.scaling.setAll(bodyRadius * descriptor.coronaScale)
    this.focusUniforms = {
      kelvin, seed: descriptor.seed, rot: rotation,
      activity: descriptor.surfaceActivity, time: this.focusUniforms.time,
    }
    safeStarWorldPosition(
      datum, this.focusUniforms.time, this.reducedMotion ? 0 : 1.35, this.focusSphere.position,
    )
    this.focusCorona.position.copyFrom(this.focusSphere.position)
    for (const material of this.focusedMaterials) {
      if (material instanceof ShaderMaterial) {
        material.setColor3('uColor', color)
        material.setFloat('uKelvin', kelvin)
        material.setFloat('uSeed', descriptor.seed)
        material.setFloat('uRot', rotation)
        material.setFloat('uActivity', descriptor.surfaceActivity)
        material.setFloat('uCoronaLayers', this.qualityConfig.coronaLayers)
      }
    }
  }

  private applyVisibility(): void {
    if (this.fallbackFailed) return
    const visible = this.focusedReady && this.focusedDatum !== null && this.presentation !== null
      && this.presentation.lodIntent !== 'point' && this.presentation.lodIntent !== 'hidden'
    this.focusSphere.setEnabled(visible && (this.presentation?.surfaceAlpha ?? 0) > 0)
    this.focusCorona.setEnabled(visible && (this.presentation?.coronaAlpha ?? 0) > 0)
  }

  private applyPresentationDimensions(): void {
    const presentation = this.presentation
    for (let index = 0; index < this.baseDimensions.length; index += 1) {
      const key = starIdentity(this.stars[index]!.s)
      const base = this.baseDimensions[index]!
      if (!presentation) {
        this.coreDimensionsBuffer[index] = base
        this.haloDimensionsBuffer[index] = base
      } else if (presentation.lodIntent === 'hidden') {
        this.coreDimensionsBuffer[index] = 0
        this.haloDimensionsBuffer[index] = 0
      } else if (this.focusedKey) {
        const focused = key === this.focusedKey
        this.coreDimensionsBuffer[index] = base * (focused
          ? presentation.coreAlpha * presentation.focusedOpacity
          : presentation.effectiveNonFocusedOpacity)
        this.haloDimensionsBuffer[index] = base * (focused
          ? presentation.haloAlpha * presentation.focusedOpacity
          : presentation.effectiveNonFocusedOpacity)
      } else {
        this.coreDimensionsBuffer[index] = base * presentation.coreAlpha
        this.haloDimensionsBuffer[index] = base * presentation.haloAlpha
      }
    }
    this.geometry.updateVerticesData('aCoreDim', this.coreDimensionsBuffer, false)
    this.geometry.updateVerticesData('aHaloDim', this.haloDimensionsBuffer, false)
  }

  private applyFocusedPresentationUniforms(): void {
    if (!this.presentation) return
    const surface = this.focusSphere.material
    const corona = this.focusCorona.material
    if (surface) surface.disableDepthWrite = this.presentation.surfaceAlpha < 0.999
    if (surface instanceof ShaderMaterial) surface.setFloat('uSurfaceAlpha', this.presentation.surfaceAlpha)
    else if (surface) surface.alpha = this.presentation.surfaceAlpha
    if (corona instanceof ShaderMaterial) {
      corona.disableDepthWrite = true
      corona.setFloat('uCoronaAlpha', this.presentation.coronaAlpha)
      corona.setFloat('uCoronaIntensity', this.presentation.coronaIntensity)
    }
  }

  private startFocusedCompilation(
    kind: 'advanced' | 'fallback',
    targets: readonly StellarCompileTarget[],
  ): void {
    const generation = ++this.compileGeneration
    this.focusedReady = false
    const succeed = () => this.completeFocusedCompilation(kind, generation)
    const fail = (cause: unknown) => this.rejectFocusedCompilation(kind, generation, asError(cause))
    for (const { material } of targets) {
      if (material instanceof ShaderMaterial) {
        material.onError = (_effect, errors) => fail(new Error(errors))
      }
    }
    try {
      if (this.options.compile) this.options.compile(kind, targets, succeed, fail)
      else Promise.all(targets.map(({ material, mesh }) => material.forceCompilationAsync(mesh)))
        .then(succeed, fail)
    } catch (cause) {
      fail(cause)
    }
  }

  private completeFocusedCompilation(kind: 'advanced' | 'fallback', generation: number): void {
    if (!this.isCurrentCompilation(kind, generation)) return
    this.compileGeneration += 1
    this.focusedReady = true
    this.fallbackActive = kind === 'fallback'
    this.applyVisibility()
  }

  private rejectFocusedCompilation(
    kind: 'advanced' | 'fallback',
    generation: number,
    cause: Error,
  ): void {
    if (!this.isCurrentCompilation(kind, generation)) return
    this.compileGeneration += 1
    this.focusedReady = false
    if (kind === 'fallback') {
      this.failFallback(cause)
      return
    }
    if (this.fallbackScheduled) return
    this.fallbackScheduled = true
    queueMicrotask(() => {
      if (this.disposed || !this.fallbackScheduled || this.focusedKind !== 'advanced') return
      this.fallbackScheduled = false
      this.activateFallback(cause)
    })
  }

  private isCurrentCompilation(kind: 'advanced' | 'fallback', generation: number): boolean {
    return !this.disposed && this.focusedKind === kind && this.compileGeneration === generation
  }

  private applyInteractions(): void {
    const presentation = this.presentation
    for (let index = 0; index < this.stars.length; index += 1) {
      const key = starIdentity(this.stars[index]!.s)
      const offset = index * 3
      this.interactionBuffer[offset] = key === this.pressedKey
        ? presentation?.coreScale ?? 1
        : key === this.hoverKey ? 1 + ((presentation?.haloIntensity ?? 1) - 1) * 0.32 : 1
      this.interactionBuffer[offset + 1] = key === this.pressedKey
        ? presentation?.coreBrightness ?? 1 : 1
      this.interactionBuffer[offset + 2] = key === this.hoverKey
        ? presentation?.haloIntensity ?? 1 : 1
    }
    this.geometry.updateVerticesData('aInteraction', this.interactionBuffer, false)
  }
}

function createCoronaMaterial(scene: Scene, suffix: string, fragmentSource: string): ShaderMaterial {
  const material = new ShaderMaterial(`stellar:focus:corona:${suffix}`, scene, {
    vertexSource: CORONA_VERTEX, fragmentSource,
  }, {
    attributes: ['position', 'uv'],
    uniforms: ['worldViewProjection', 'uColor', 'uActivity', 'uSeed', 'uRot', 'uTime', 'uCoronaAlpha', 'uCoronaIntensity', 'uCoronaLayers'],
    needAlphaBlending: true,
  })
  material.backFaceCulling = false
  material.setColor3('uColor', Color3.White())
  material.setFloat('uActivity', 0)
  material.setFloat('uSeed', 0)
  material.setFloat('uRot', 0)
  material.setFloat('uTime', 0)
  material.setFloat('uCoronaAlpha', 0)
  material.setFloat('uCoronaIntensity', 1)
  material.setFloat('uCoronaLayers', 1)
  return material
}

function createFallbackSurfaceMaterial(scene: Scene): ShaderMaterial {
  const material = new ShaderMaterial('stellar:focus:surface:fallback', scene, {
    vertexSource: FALLBACK_SURFACE_VERTEX,
    fragmentSource: FALLBACK_SURFACE_FRAGMENT,
  }, {
    attributes: ['position', 'normal'],
    uniforms: ['worldViewProjection', 'world', 'cameraPosition', 'uColor', 'uSurfaceAlpha'],
    needAlphaBlending: true,
  })
  material.alphaMode = Constants.ALPHA_COMBINE
  material.disableDepthWrite = true
  material.setColor3('uColor', Color3.White())
  material.setFloat('uSurfaceAlpha', 0)
  return material
}

function createPanoramaGeometry(
  scene: Scene,
  stars: readonly StarDatum[],
  descriptors: readonly StarVisualDescriptor[],
  dimensions: Float32Array,
  coreDimensions: Float32Array,
  haloDimensions: Float32Array,
  interactions: Float32Array,
): Geometry {
  const geometry = new Geometry('stellar:panorama:shared-geometry', scene)
  const vectors = (select: (datum: StarDatum, index: number) => readonly [number, number, number]) => {
    const values = new Float32Array(stars.length * 3)
    stars.forEach((datum, index) => values.set(select(datum, index), index * 3))
    return values
  }
  const scalars = (select: (datum: StarDatum, index: number) => number) =>
    Float32Array.from(stars, select)
  geometry.setVerticesData('position', vectors(({ p }) => safeVector(p)), false, 3)
  geometry.setVerticesData('aCenter', vectors(({ center }) => safeVector(center)), false, 3)
  geometry.setVerticesData('aAxis', vectors(({ axis }) => safeAxis(axis)), false, 3)
  geometry.setVerticesData('aColor', vectors((_datum, index) => descriptors[index]!.color), false, 3)
  geometry.setVerticesData('aPeriod', scalars(({ period }) => Math.max(0, finiteOr(period, 0))), false, 1)
  geometry.setVerticesData('aCoreSize', scalars((_datum, index) => descriptors[index]!.panoramaCorePx), false, 1)
  geometry.setVerticesData('aHaloSize', scalars((_datum, index) => descriptors[index]!.panoramaHaloPx), false, 1)
  geometry.setVerticesData('aBright', scalars((_datum, index) => descriptors[index]!.luminance), false, 1)
  geometry.setVerticesData('aBurst', scalars((_datum, index) => descriptors[index]!.surfaceActivity), false, 1)
  geometry.setVerticesData('aSeed', scalars((_datum, index) => descriptors[index]!.seed), false, 1)
  geometry.setVerticesData('aRot', scalars(({ rot }) => finiteOr(rot, 0)), false, 1)
  geometry.setVerticesData('aBodyR', scalars(({ bodyR }) => clampFinite(bodyR, 0.3, 0.01, 10)), false, 1)
  geometry.setVerticesData('aDim', dimensions, true, 1)
  geometry.setVerticesData('aCoreDim', coreDimensions, true, 1)
  geometry.setVerticesData('aHaloDim', haloDimensions, true, 1)
  geometry.setVerticesData('aInteraction', interactions, true, 3)
  return geometry
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function rounded(value: number): number {
  return Math.round(value * 10_000) / 10_000
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clampFinite(value: number, fallback: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, finiteOr(value, fallback)))
}

function safeVector(value: readonly [number, number, number]): readonly [number, number, number] {
  return [finiteOr(value[0], 0), finiteOr(value[1], 0), finiteOr(value[2], 0)]
}

function safeAxis(value: readonly [number, number, number]): readonly [number, number, number] {
  const [x, y, z] = safeVector(value)
  const length = Math.hypot(x, y, z)
  return length > 0 ? [x / length, y / length, z / length] : [0, 1, 0]
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error(String(cause))
}

function safeStarWorldPosition(
  datum: StarDatum,
  elapsedMs: number,
  bobAmplitude: number,
  out: { set(x: number, y: number, z: number): unknown },
): void {
  const p = safeVector(datum.p)
  const center = safeVector(datum.center)
  const axis = safeAxis(datum.axis)
  const period = Math.max(0, finiteOr(datum.period, 0))
  const seed = Math.abs(Math.trunc(finiteOr(datum.seed, 1)))
  const offsetX = p[0] - center[0]
  const offsetY = p[1] - center[1]
  const offsetZ = p[2] - center[2]
  const theta = period === 0 ? 0 : Math.PI * 2 / period * (elapsedMs / 1000)
  const cosine = Math.cos(theta)
  const sine = Math.sin(theta)
  const dot = axis[0] * offsetX + axis[1] * offsetY + axis[2] * offsetZ
  const crossX = axis[1] * offsetZ - axis[2] * offsetY
  const crossY = axis[2] * offsetX - axis[0] * offsetZ
  const crossZ = axis[0] * offsetY - axis[1] * offsetX
  const bob = Math.sin(elapsedMs / (6400 + seed * 311 % 5200) + seed) * bobAmplitude
  out.set(
    center[0] + offsetX * cosine + crossX * sine + axis[0] * (dot * (1 - cosine) + bob),
    center[1] + offsetY * cosine + crossY * sine + axis[1] * (dot * (1 - cosine) + bob),
    center[2] + offsetZ * cosine + crossZ * sine + axis[2] * (dot * (1 - cosine) + bob),
  )
}
