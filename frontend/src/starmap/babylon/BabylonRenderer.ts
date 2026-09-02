import { Engine } from '@babylonjs/core/Engines/engine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import { Viewport } from '@babylonjs/core/Maths/math.viewport.js'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js'
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents.js'
import { selectPlanetData, type UniverseIndex } from '../../domain/universe'
import type { Mode } from '../../types'
import { buildMaterialTimeline, planetMaterialInput } from '../gl/planetMaterials'
import { starData, type StarDatum } from '../gl/starData'
import type { PlanetDatum } from '../gl/bodies'
import type {
  InspectionPose,
  MindverseRenderer,
  ProbePart,
  RendererCallbacks,
  StrataMoveIntent,
  StrataRequest,
  StrataToken,
} from '../rendererContract'
import { BabylonRuntime, BabylonWebGL2RequiredError } from './runtime'
import { buildPlanetSurfaceDescriptor, type PlanetSurfaceDescriptor } from './planetSurface'
import { planetFragmentShader } from './shaders/planet.fragment.fx'
import { planetVertexShader } from './shaders/planet.vertex.fx'

const ORBIT_BASE = 2.1
const ORBIT_STEP = 1.15
const PLANET_MIN = 0.085
const PLANET_MAX = 0.20

interface PlanetVisual {
  readonly datum: PlanetDatum
  readonly descriptor: PlanetSurfaceDescriptor
  readonly mesh: Mesh
  readonly material: ShaderMaterial
}

export class BabylonRenderer implements MindverseRenderer {
  private readonly runtime: BabylonRuntime
  private readonly callbacks: RendererCallbacks
  private readonly canvas: HTMLCanvasElement
  private readonly labelCanvas: HTMLCanvasElement
  private readonly engine: Engine
  private readonly scene: Scene
  private readonly camera: ArcRotateCamera
  private readonly planets: readonly PlanetDatum[]
  private readonly visualByQuestion = new Map<string, PlanetVisual>()
  private readonly visualByMeshId = new Map<number, PlanetVisual>()
  private readonly starByMeshId = new Map<number, StarDatum>()
  private readonly probes: ReadonlySet<string>
  private selected: PlanetDatum | null = null
  private selectedVisual: PlanetVisual | null = null
  private focusedStar: StarDatum | null = null
  private elapsedMs = 0
  private overviewTarget = Vector3.Zero()
  private overviewRadius = 30
  private destroyed = false
  private reducedMotion: boolean

  constructor(
    canvas: HTMLCanvasElement,
    labelCanvas: HTMLCanvasElement,
    index: UniverseIndex,
    reducedMotion: boolean,
    callbacks: RendererCallbacks = {},
  ) {
    this.canvas = canvas
    this.labelCanvas = labelCanvas
    this.callbacks = callbacks
    this.reducedMotion = reducedMotion
    this.planets = buildPlanetBookkeeping(index)
    this.probes = new Set(index.probesById.keys())

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      disableWebGL2Support: false,
    })
    if (engine.webGLVersion < 2) {
      engine.dispose()
      throw new BabylonWebGL2RequiredError()
    }
    this.engine = engine

    let scene: Scene | null = null
    let runtimeConstructionStarted = false
    try {
      scene = new Scene(engine)
      this.scene = scene
      scene.clearColor = new Color4(0, 0, 0, 1)
      const camera = new ArcRotateCamera('mindverse-camera', -Math.PI / 2, Math.PI / 2.55, 30, Vector3.Zero(), scene)
      this.camera = camera
      camera.minZ = 0.1
      camera.lowerRadiusLimit = 1.2
      camera.upperRadiusLimit = 10_000
      camera.wheelDeltaPercentage = 0.012
      camera.pinchDeltaPercentage = 0.012
      camera.attachControl(canvas, true)
      scene.activeCamera = camera
      this.createScene(index)
      runtimeConstructionStarted = true
      this.runtime = new BabylonRuntime({
        engine,
        scene,
        canvas: {
          addEventListener: (type, listener) => canvas.addEventListener(type, listener),
          removeEventListener: (type, listener) => canvas.removeEventListener(type, listener),
        },
      }, {
        onReady: callbacks.onRenderReady,
        onError: callbacks.onRenderError,
      })
      this.resizeLabels()
    } catch (cause) {
      if (!runtimeConstructionStarted) {
        if (scene) scene.dispose()
        engine.dispose()
      }
      throw cause
    }
  }

  start(): void { this.runtime.start() }
  stop(): void { this.runtime.stop() }
  suspend(): void { this.runtime.suspend() }
  resume(): void { this.runtime.resume() }
  resize(): void {
    this.runtime.resize()
    this.resizeLabels()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.selected = null
    this.selectedVisual = null
    this.runtime.destroy()
  }

  setMode(_mode: Mode, _wormIdx = 0): void {}

  resetView(): void {
    if (this.destroyed) return
    this.clearPlanet()
    this.focusedStar = null
    this.camera.setTarget(this.overviewTarget)
    this.camera.radius = this.overviewRadius
  }

  clearPlanet(): void {
    if (this.destroyed || !this.selected) return
    this.selectedVisual?.material.setFloat('uSelected', 0)
    this.selected = null
    this.selectedVisual = null
    this.callbacks.onAnchor?.(0, 0, false)
    this.callbacks.onPickPlanet?.(null)
    if (this.focusedStar) {
      this.camera.setTarget(Vector3.FromArray(this.focusedStar.p))
      this.camera.radius = Math.max(8, this.focusedStar.bodyR * 14)
    }
  }

  selectQuestionPlanet(starId: string, questionId: string): PlanetDatum | null {
    if (this.destroyed) return null
    const planet = this.planets.find((candidate) =>
      'id' in candidate.star.s && candidate.star.s.id === starId && candidate.question.id === questionId) ?? null
    if (!planet) return null
    this.selectedVisual?.material.setFloat('uSelected', 0)
    this.selected = planet
    this.selectedVisual = this.visualByQuestion.get(planet.question.id) ?? null
    this.focusedStar = planet.star
    this.selectedVisual?.material.setFloat('uSelected', 1)
    if (this.selectedVisual) {
      this.camera.setTarget(this.selectedVisual.mesh.position)
      this.camera.radius = Math.max(2.8, this.selectedVisual.descriptor.radius * 4.2)
    }
    this.callbacks.onPickPlanet?.(planet)
    return planet
  }

  restoreQuestionPlanet(starId: string, questionId: string): PlanetDatum | null {
    return this.selectQuestionPlanet(starId, questionId)
  }

  setWorkspaceOpen(open: boolean): void {
    if (this.destroyed) return
    this.canvas.style.pointerEvents = open ? 'none' : ''
    this.camera.viewport = open && this.engine.getRenderWidth() > 760
      ? new Viewport(0.18, 0, 0.82, 1)
      : open ? new Viewport(0, 0.16, 1, 0.84) : new Viewport(0, 0, 1, 1)
  }

  orbitWorkspace(deltaX: number, deltaY: number): void {
    if (this.destroyed || !this.selected) return
    this.camera.alpha -= deltaX * 0.006
    this.camera.beta = Math.min(Math.PI - 0.08, Math.max(0.08, this.camera.beta + deltaY * 0.005))
  }

  approachProbe(probeId: string, token: number): void {
    this.reportProbeUnsupported(probeId, token)
  }

  startProbeScan(probeId: string, token: number): void {
    this.reportProbeUnsupported(probeId, token)
  }

  setProbeInspectionPose(_pose: InspectionPose): void {}
  focusProbePart(_part: ProbePart | null): void {}
  exitProbeInspection(): void {}

  setReducedMotion(reduced: boolean): void {
    if (this.destroyed || this.reducedMotion === reduced) return
    this.reducedMotion = reduced
  }

  skipGenesis(): void {
    if (!this.destroyed) this.callbacks.onGenesisEnd?.()
  }

  enterStrata(request: StrataRequest): void {
    if (this.destroyed) return
    this.callbacks.onStrataError?.({
      token: request.token,
      questionId: request.questionId,
      scope: 'transition',
      cause: unsupported('答案地层尚未接入 Babylon 垂直样片。'),
    })
  }

  moveStrata(_input: StrataMoveIntent): void {}
  focusAnswerSpecimen(_answerId: string): void {}
  closeAnswerSpecimen(): void {}
  exitStrata(_token: StrataToken): void {}

  private createScene(index: UniverseIndex): void {
    this.scene.imageProcessingConfiguration.toneMappingEnabled = true
    this.scene.imageProcessingConfiguration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL
    this.scene.imageProcessingConfiguration.exposure = 0.92
    const pipeline = new DefaultRenderingPipeline('mindverse-pipeline', true, this.scene, [this.camera])
    pipeline.fxaaEnabled = false
    pipeline.bloomEnabled = true
    pipeline.bloomThreshold = 0.72
    pipeline.bloomWeight = 0.14
    pipeline.bloomKernel = 48

    const stars = starData(index.universe)
    this.configureOverview(stars)
    for (const star of stars) this.createStar(star)
    for (const planet of this.planets) this.createPlanet(planet)

    this.scene.onBeforeRenderObservable.add(() => this.updateScene())
    this.scene.onPointerObservable.add((info) => {
      if (this.destroyed || info.type !== PointerEventTypes.POINTERPICK) return
      const mesh = info.pickInfo?.pickedMesh
      if (!mesh) return
      const visual = this.visualByMeshId.get(mesh.uniqueId)
      if (visual) {
        const starId = 'id' in visual.datum.star.s ? visual.datum.star.s.id : ''
        if (starId) this.selectQuestionPlanet(starId, visual.datum.question.id)
        return
      }
      const star = this.starByMeshId.get(mesh.uniqueId)
      if (star) this.focusStar(star)
    }, PointerEventTypes.POINTERPICK)
  }

  private configureOverview(stars: readonly StarDatum[]): void {
    if (stars.length === 0) return
    const center = stars.reduce((sum, star) => sum.addInPlace(Vector3.FromArray(star.p)), Vector3.Zero())
      .scaleInPlace(1 / stars.length)
    const extent = Math.max(8, ...stars.map((star) => Vector3.Distance(center, Vector3.FromArray(star.p))))
    this.overviewTarget = center
    this.overviewRadius = extent * 2.4
    this.camera.setTarget(center)
    this.camera.radius = this.overviewRadius
  }

  private createStar(star: StarDatum): void {
    const mesh = CreateSphere(`star:${'id' in star.s ? star.s.id : star.s.c}`, {
      diameter: Math.max(0.6, star.bodyR * 2),
      segments: 12,
    }, this.scene)
    mesh.position.set(star.p[0], star.p[1], star.p[2])
    mesh.isPickable = true
    const material = new StandardMaterial(`${mesh.name}:material`, this.scene)
    const color = new Color3(star.color[0], star.color[1], star.color[2])
    material.diffuseColor = color.scale(0.18)
    material.emissiveColor = color.scale(1.35)
    material.specularColor = Color3.Black()
    mesh.material = material
    this.starByMeshId.set(mesh.uniqueId, star)
  }

  private createPlanet(datum: PlanetDatum): void {
    if (!('id' in datum.star.s)) return
    const descriptor = buildPlanetSurfaceDescriptor({
      questionId: datum.question.id,
      starId: datum.star.s.id,
      answerCount: datum.answerCount,
      timeSpan: datum.material.timeSpan,
      freshness: datum.material.freshness,
      created: datum.created,
      collected: datum.collected,
      normalizedStarEnergy: datum.star.bright * 1.8,
      normalizedOrbitDistance: datum.orbitR / ORBIT_BASE,
    })
    const mesh = CreateIcoSphere(`planet:${datum.question.id}`, { radius: 1, subdivisions: 4 }, this.scene)
    mesh.scaling.setAll(descriptor.radius * 0.38)
    mesh.isPickable = true
    mesh.metadata = { questionId: datum.question.id, starId: datum.star.s.id }
    const material = new ShaderMaterial(`${mesh.name}:material`, this.scene, {
      vertexSource: planetVertexShader,
      fragmentSource: planetFragmentShader,
    }, {
      attributes: ['position', 'normal'],
      uniforms: [
        'worldViewProjection', 'uTime', 'uDisplacement', 'uDetailDensity', 'uFaultStrength',
        'uThermal', 'uThermalIce', 'uFreshness', 'uCreated', 'uCollected', 'uSelected', 'uSeed',
      ],
    })
    material.backFaceCulling = true
    material.setFloat('uTime', 0)
    material.setFloat('uDisplacement', 0.08 + descriptor.detailDensity * 0.16)
    material.setFloat('uDetailDensity', descriptor.detailDensity)
    material.setFloat('uFaultStrength', descriptor.faultStrength)
    material.setVector4('uThermal', new Vector4(
      descriptor.thermal.magma,
      descriptor.thermal.desert,
      descriptor.thermal.rock,
      descriptor.thermal.tundra,
    ))
    material.setFloat('uThermalIce', descriptor.thermal.ice)
    material.setFloat('uFreshness', descriptor.atmosphere)
    material.setFloat('uCreated', descriptor.createdGlow)
    material.setFloat('uCollected', descriptor.collectedMarker)
    material.setFloat('uSelected', 0)
    material.setFloat('uSeed', datum.material.seed)
    mesh.material = material
    const visual = Object.freeze({ datum, descriptor, mesh, material })
    this.visualByQuestion.set(datum.question.id, visual)
    this.visualByMeshId.set(mesh.uniqueId, visual)
    this.updatePlanetPosition(visual, 0)
  }

  private updateScene(): void {
    if (this.destroyed) return
    this.elapsedMs += this.reducedMotion ? 0 : Math.min(50, Math.max(0, this.engine.getDeltaTime()))
    for (const visual of this.visualByQuestion.values()) {
      this.updatePlanetPosition(visual, this.elapsedMs)
      visual.material.setFloat('uTime', this.elapsedMs)
    }
    if (this.selectedVisual) {
      this.camera.target.copyFrom(this.selectedVisual.mesh.position)
      this.updateAnchor(this.selectedVisual.mesh)
    }
  }

  private updatePlanetPosition(visual: PlanetVisual, elapsedMs: number): void {
    const datum = visual.datum
    const angle = datum.phase + Math.PI * 2 / datum.period * (elapsedMs / 1000)
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    visual.mesh.position.set(
      datum.star.p[0] + (datum.u[0] * cosine + datum.v[0] * sine) * datum.orbitR,
      datum.star.p[1] + (datum.u[1] * cosine + datum.v[1] * sine) * datum.orbitR,
      datum.star.p[2] + (datum.u[2] * cosine + datum.v[2] * sine) * datum.orbitR,
    )
    visual.mesh.rotation.y = angle * 0.37 + datum.material.seed * Math.PI * 2
  }

  private updateAnchor(mesh: Mesh): void {
    if (!this.callbacks.onAnchor) return
    const viewport = this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight())
    const projected = Vector3.Project(mesh.getAbsolutePosition(), Matrix.Identity(), this.scene.getTransformMatrix(), viewport)
    const visible = projected.z >= 0 && projected.z <= 1
    this.callbacks.onAnchor(projected.x, projected.y, visible)
  }

  private focusStar(star: StarDatum): void {
    this.clearPlanet()
    this.focusedStar = star
    this.camera.setTarget(Vector3.FromArray(star.p))
    this.camera.radius = Math.max(8, star.bodyR * 14)
    this.callbacks.onPick?.(star.s)
  }

  private resizeLabels(): void {
    const rect = this.labelCanvas.getBoundingClientRect()
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.labelCanvas.width = Math.max(1, Math.round(rect.width * dpr))
    this.labelCanvas.height = Math.max(1, Math.round(rect.height * dpr))
  }

  private reportProbeUnsupported(probeId: string, token: number): void {
    if (this.destroyed) return
    const label = this.probes.has(probeId) ? 'Babylon 垂直样片尚未迁移探测器检查。' : `未知探测器：${probeId}`
    this.callbacks.onProbeError?.({ probeId, token, cause: unsupported(label) })
  }
}

function unsupported(message: string): Error {
  const cause = new Error(message)
  cause.name = 'UnsupportedRendererFeatureError'
  return cause
}

function buildPlanetBookkeeping(index: UniverseIndex): readonly PlanetDatum[] {
  const timeline = buildMaterialTimeline([...index.answersById.values()])
  const planets: PlanetDatum[] = []
  for (const star of starData(index.universe)) {
    if (!('id' in star.s)) continue
    for (const datum of selectPlanetData(index, star.s)) {
      const material = planetMaterialInput(datum, timeline)
      const orbitR = ORBIT_BASE + (datum.orbitIndex - 1) * ORBIT_STEP
      planets.push(Object.freeze({
        star,
        question: datum.question,
        answerCount: datum.answerCount,
        created: datum.created,
        collected: datum.collected,
        ...(datum.latestPublicAt === undefined ? {} : { latestPublicAt: datum.latestPublicAt }),
        answers: datum.answers,
        material,
        orbitIndex: datum.orbitIndex,
        index: planets.length,
        u: [star.sysU[0], star.sysU[1], star.sysU[2]] as [number, number, number],
        v: [star.sysV[0], star.sysV[1], star.sysV[2]] as [number, number, number],
        orbitR,
        phase: ((datum.orbitIndex * 137.508 + star.seed * 31.7) * Math.PI) / 180,
        period: 7 + 2.4 * Math.pow(orbitR, 1.5),
        radius: PLANET_MIN + (PLANET_MAX - PLANET_MIN) * material.answerDensity,
      }))
    }
  }
  return Object.freeze(planets)
}
