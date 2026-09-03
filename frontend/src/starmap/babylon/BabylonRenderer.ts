import { Engine } from '@babylonjs/core/Engines/engine.js'
import '@babylonjs/core/Culling/ray.js'
import { Scene } from '@babylonjs/core/scene.js'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Quaternion, Vector3, Vector4 } from '@babylonjs/core/Maths/math.vector.js'
import { Viewport } from '@babylonjs/core/Maths/math.viewport.js'
import { PointLight } from '@babylonjs/core/Lights/pointLight.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js'
import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js'
import { selectPlanetData, type UniverseIndex } from '../../domain/universe'
import type { Mode, Star, Universe } from '../../types'
import { buildMaterialTimeline, planetMaterialInput } from '../gl/planetMaterials'
import { starColor } from '../gl/blackbody'
import { forcedE2EQuality, installE2EDiagnostics, recordE2EFrame, removeE2EDiagnostics, type RenderSnapshot } from '../e2eDiagnostics'
import { starData, starWorldPosition, type StarDatum } from '../gl/starData'
import { starIdentity } from '../starIdentity'
import { renderDim, resolveInteractiveStar, starInteractionEligible } from '../starVisibility'
import { detectQuality } from '../quality'
import { clusterAxis, orbitRing } from '../projection'
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
import {
  CAVE_CYLINDER_CAP,
  movementDeltaSeconds,
  undatedPassageGeometry,
  type CaveLayout,
  type CaveSpecimenPlacement,
} from './strataScene'
import { StrataTransitionController, type StrataAnimationPhase } from './strataTransition'
import {
  applyOrbitLineAlpha,
  macroOrbitAlpha,
  questionOrbitAlpha,
  questionPlanetPresentation,
  selectDominantClusterIds,
  selectMacroOrbitRadius,
  StellarPointerPresentationController,
  type OrbitPresentationState,
} from './orbitPresentation'
import { StarLayer } from './starLayer'
import { describeStarPresentation, HOVER_INTERPOLATION_MS, type StarPresentation } from './starPresentation'
import { ProjectedStarCandidateBuffer, pickProjectedStar, type PointerInputKind } from './starPicker'
import { CameraFlightController, computeSystemExtent, exitTarget, shouldExitOnWheel, type CameraFlight } from './cameraFlight'

const ORBIT_BASE = 2.1
const ORBIT_STEP = 1.15
const PLANET_MIN = 0.085
const PLANET_MAX = 0.20
const activeBabylonRenderers = new Set<BabylonRenderer>()

interface PlanetVisual {
  readonly datum: PlanetDatum
  readonly descriptor: PlanetSurfaceDescriptor
  readonly mesh: Mesh
  readonly material: ShaderMaterial
  readonly orbit: LinesMesh
}

interface MacroOrbitVisual {
  readonly ownerKey: string
  readonly mesh: LinesMesh
}

export class BabylonRenderer implements MindverseRenderer {
  private readonly runtime: BabylonRuntime
  private readonly callbacks: RendererCallbacks
  private readonly canvas: HTMLCanvasElement
  private readonly labelCanvas: HTMLCanvasElement
  private readonly engine: Engine
  private readonly scene: Scene
  private readonly camera: ArcRotateCamera
  private readonly universeRoot: TransformNode
  private readonly universe: Universe
  private readonly stars: readonly StarDatum[]
  private readonly starLayer: StarLayer
  private readonly candidateBuffer: ProjectedStarCandidateBuffer
  private readonly pointerPresentation = new StellarPointerPresentationController()
  private readonly cameraFlightController = new CameraFlightController()
  private caveRoot: TransformNode | null = null
  private readonly planets: readonly PlanetDatum[]
  private readonly visualByQuestion = new Map<string, PlanetVisual>()
  private readonly macroOrbits: MacroOrbitVisual[] = []
  private readonly visualByMeshId = new Map<number, PlanetVisual>()
  private readonly specimenByMeshId = new Map<number, CaveSpecimenPlacement>()
  private readonly probes: ReadonlySet<string>
  private readonly strataTransition: StrataTransitionController
  private selected: PlanetDatum | null = null
  private selectedVisual: PlanetVisual | null = null
  private focusedStar: StarDatum | null = null
  private mode: Mode = 'all'
  private wormIdx = 0
  private readonly interactionByDatum = new Map<StarDatum, boolean>()
  private hoverKey: string | null = null
  private pressedKey: string | null = null
  private hoverProgress = 0
  private pressedProgress = 0
  private activeFlight: Readonly<{ flight: CameraFlight; elapsedMs: number }> | null = null
  private presentation: StarPresentation = describeStarPresentation({ phase: 'panorama' })
  private lastLayerPresentation: StarPresentation | null = null
  private lastLayerHoverKey: string | null = null
  private lastLayerPressedKey: string | null = null
  private lastPresentationInput: Readonly<{
    phase: OrbitPresentationState['phase']
    approachProgress: number | undefined
    hoverProgress: number
    pressedProgress: number
  }> | null = null
  private elapsedMs = 0
  private lastStrataMoveAt: number | null = null
  private overviewTarget = Vector3.Zero()
  private overviewRadius = 30
  private entryCameraSnapshot: Readonly<{ alpha: number; beta: number; radius: number; target: Vector3 }> | null = null
  private destroyed = false
  private universeVisible = true
  private workspaceOpen = false
  private reducedMotion: boolean
  private diagnosticClickEvents = 0
  private diagnosticLastPick: NonNullable<RenderSnapshot['lifecycle']['lastPick']> = 'none'
  private readonly starPositionScratch = new Vector3()
  private readonly flightTargetScratch = new Vector3()
  private readonly planetStarPositionScratch = new Vector3()
  private readonly candidateWorldScratch = new Vector3()
  private readonly projectionIdentity = Matrix.Identity()
  private readonly projectionViewport = new Viewport(0, 0, 1, 1)
  private readonly projectedPositionScratch = new Vector3()
  private readonly pointerProjectionScratch = { x: 0, y: 0, z: 0 }
  private readonly candidateProjectionScratch = { x: 0, y: 0, depth: 0, visible: false }

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
    this.universe = index.universe
    this.stars = starData(index.universe)
    this.candidateBuffer = new ProjectedStarCandidateBuffer(this.stars)
    this.reducedMotion = reducedMotion
    this.planets = buildPlanetBookkeeping(index, this.stars)
    this.probes = new Set(index.probesById.keys())

    if (import.meta.env.VITE_E2E_DIAGNOSTICS === '1'
      && new URLSearchParams(location.search).get('e2eEngineFail') === '1') {
      throw new Error('E2E injected Babylon Engine initialization failure')
    }

    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      disableWebGL2Support: false,
    })
    const forceWebGL2Unavailable = import.meta.env.VITE_E2E_DIAGNOSTICS === '1'
      && new URLSearchParams(location.search).get('e2eWebGL2Unavailable') === '1'
    if (engine.webGLVersion < 2 || forceWebGL2Unavailable) {
      engine.dispose()
      releaseCanvasWebGLContext(canvas)
      throw new BabylonWebGL2RequiredError()
    }
    this.engine = engine

    let scene: Scene | null = null
    let runtime: BabylonRuntime | null = null
    let runtimeConstructionStarted = false
    let pointerListenersInstalled = false
    try {
      scene = new Scene(engine)
      this.scene = scene
      scene.clearColor = new Color4(0, 0, 0, 1)
      this.universeRoot = new TransformNode('universe-root', scene)
      const camera = new ArcRotateCamera('mindverse-camera', -Math.PI / 2, Math.PI / 2.55, 30, Vector3.Zero(), scene)
      this.camera = camera
      camera.minZ = 0.1
      camera.lowerRadiusLimit = 1.2
      camera.upperRadiusLimit = 10_000
      camera.wheelDeltaPercentage = 0.012
      camera.pinchDeltaPercentage = 0.012
      camera.attachControl(canvas, true)
      scene.activeCamera = camera
      const forcedQuality = import.meta.env.VITE_E2E_DIAGNOSTICS === '1'
        ? forcedE2EQuality(location.search)
        : null
      this.starLayer = new StarLayer(scene, this.stars, forcedQuality ?? detectQuality(reducedMotion), reducedMotion, {
        parent: this.universeRoot,
        onError: callbacks.onRenderError,
      })
      this.applyModeDimensions()
      this.starLayer.setPresentation(this.presentation, null, null)
      this.lastLayerPresentation = this.presentation
      this.strataTransition = new StrataTransitionController({
        capturePose: () => this.captureStrataEntryPose(),
        applyPose: (pose) => this.applyStrataPose(pose),
        setUniverseVisible: (visible) => this.setUniverseVisible(visible),
        animate: (phase, token, complete, fail) => this.animateStrata(phase, token, complete, fail),
      }, callbacks)
      this.createScene(index)
      pointerListenersInstalled = true
      this.installPointerListeners()
      runtimeConstructionStarted = true
      runtime = new BabylonRuntime({
        engine,
        scene,
        releaseContext: () => releaseCanvasWebGLContext(canvas),
        canvas: {
          addEventListener: (type, listener) => canvas.addEventListener(type, listener),
          removeEventListener: (type, listener) => canvas.removeEventListener(type, listener),
        },
      }, {
        onReady: callbacks.onRenderReady,
        onError: callbacks.onRenderError,
      })
      this.runtime = runtime
      this.resizeLabels()
      if (import.meta.env.VITE_E2E_DIAGNOSTICS === '1') {
        installE2EDiagnostics(
          this,
          'high',
          () => ({ geometries: this.scene.meshes.length, textures: this.scene.textures.length }),
          () => this.diagnosticScene(),
          {
            rendererKind: 'babylon',
            // Each live renderer owns exactly one Engine and its single WebGL2 context.
            activeContextCount: () => activeBabylonRenderers.size,
            scenePhase: () => this.diagnosticPhase(),
            projectedBounds: () => {
              const answerSpecimens = this.answerSpecimenDiagnostics()
              return {
                selectedPlanet: this.selectedPlanetBounds(),
                firstAnswerSpecimen: this.firstAnswerSpecimenBounds(answerSpecimens),
                answerSpecimens,
              }
            },
            lifecycle: () => {
              const runtime = this.runtime.diagnostics()
              return {
                rafLoops: runtime.renderLoops,
                listeners: runtime.listeners + (this.destroyed ? 0 : 8),
                clickEvents: this.diagnosticClickEvents,
                lastPick: this.diagnosticLastPick,
              }
            },
          },
        )
      }
      activeBabylonRenderers.add(this)
    } catch (cause) {
      if (pointerListenersInstalled) this.removePointerListeners()
      if (runtime) runtime.destroy()
      else if (!runtimeConstructionStarted) {
        if (scene) scene.dispose()
        engine.dispose()
        releaseCanvasWebGLContext(canvas)
      }
      throw cause
    }
  }

  start(): void { this.runtime.start() }
  stop(): void { this.runtime.stop() }
  suspend(): void {
    this.cancelFlight('suspend')
    this.clearPointerFeedback()
    this.runtime.suspend()
  }
  resume(): void { this.runtime.resume() }
  resize(): void {
    this.runtime.resize()
    this.resizeLabels()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    activeBabylonRenderers.delete(this)
    this.selected = null
    this.selectedVisual = null
    this.cancelFlight('destroy')
    this.clearPointerFeedback()
    this.strataTransition.destroy()
    this.removePointerListeners()
    this.starLayer.dispose()
    if (import.meta.env.VITE_E2E_DIAGNOSTICS === '1') removeE2EDiagnostics(this)
    this.runtime.destroy()
  }

  setMode(mode: Mode, wormIdx = 0): void {
    if (this.destroyed) return
    if (this.mode === mode && this.wormIdx === wormIdx) return
    this.mode = mode
    this.wormIdx = wormIdx
    this.applyModeDimensions()
    if (this.focusedStar && !this.isInteractive(this.focusedStar)) this.resetView()
    if (this.hoverKey && !this.isKeyInteractive(this.hoverKey)) this.clearPointerFeedback()
    this.syncOrbitPresentation()
  }

  focusStar(starKey: string): Star | null {
    if (this.destroyed || !this.universeVisible || this.strataTransition.phase !== null) return null
    const star = resolveInteractiveStar(this.stars, starKey, this.mode, this.universe, this.wormIdx)
    if (!star) return null
    if (this.focusedStar === star && !this.selected) return star.s
    if (!this.applyStarFocus(star)) return null
    this.callbacks.onPick?.(star.s)
    return star.s
  }

  resetView(): void {
    if (this.destroyed) return
    this.cancelFlight('reset')
    this.clearPlanet()
    this.focusedStar = null
    this.starLayer.setFocus(null, null)
    this.camera.setTarget(this.overviewTarget)
    this.camera.radius = this.overviewRadius
    this.syncOrbitPresentation()
  }

  clearPlanet(): void {
    if (this.destroyed || !this.selected) return
    this.selectedVisual?.material.setFloat('uSelected', 0)
    this.selected = null
    this.selectedVisual = null
    this.callbacks.onAnchor?.(0, 0, false)
    this.callbacks.onPickPlanet?.(null)
    if (this.focusedStar) {
      this.camera.setTarget(this.currentStarPosition(this.focusedStar))
      this.camera.radius = this.systemFraming(this.focusedStar).radius
    }
    this.syncOrbitPresentation()
  }

  selectQuestionPlanet(starId: string, questionId: string): PlanetDatum | null {
    if (this.destroyed) return null
    const planet = this.planets.find((candidate) =>
      'id' in candidate.star.s && candidate.star.s.id === starId && candidate.question.id === questionId) ?? null
    if (!planet) return null
    this.cancelFlight('planet')
    this.selectedVisual?.material.setFloat('uSelected', 0)
    this.selected = planet
    this.selectedVisual = this.visualByQuestion.get(planet.question.id) ?? null
    this.focusedStar = planet.star
    this.starLayer.setFocus(starIdentity(planet.star.s), planet.star)
    this.selectedVisual?.material.setFloat('uSelected', 1)
    if (this.selectedVisual) {
      this.camera.setTarget(this.selectedVisual.mesh.position)
      this.camera.radius = Math.max(2.8, this.selectedVisual.descriptor.radius * 4.2)
    }
    this.syncOrbitPresentation()
    this.callbacks.onPickPlanet?.(planet)
    return planet
  }

  restoreQuestionPlanet(starId: string, questionId: string): PlanetDatum | null {
    return this.selectQuestionPlanet(starId, questionId)
  }

  setWorkspaceOpen(open: boolean): void {
    if (this.destroyed) return
    this.workspaceOpen = open
    this.canvas.style.pointerEvents = open ? 'none' : ''
    if (open) this.camera.detachControl()
    else if (this.universeVisible) this.camera.attachControl(this.canvas, true)
    this.camera.viewport = open && this.engine.getRenderWidth() > 760
      ? new Viewport(0.18, 0, 0.82, 1)
      : open ? new Viewport(0, 0.16, 1, 0.84) : new Viewport(0, 0, 1, 1)
    if (open) this.clearPointerFeedback()
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
    this.starLayer.setReducedMotion(reduced)
    const active = this.activeFlight
    if (reduced && active && this.focusedStar) {
      const target = this.currentStarPosition(this.focusedStar)
      const radius = active.flight.to.radius
      this.cancelFlight('user')
      this.camera.setTarget(target)
      this.camera.radius = radius
      this.syncStarLayerPresentation()
      this.syncOrbitPresentation()
    }
    for (const visual of this.visualByQuestion.values()) {
      this.updatePlanetPosition(visual, this.elapsedMs)
      visual.material.setFloat('uTime', this.motionTime())
    }
    if (this.selectedVisual && this.universeVisible) {
      this.camera.target.copyFrom(this.selectedVisual.mesh.position)
    } else if (this.focusedStar && !this.activeFlight && this.universeVisible) {
      this.camera.target.copyFrom(this.currentStarPosition(this.focusedStar))
    }
  }

  skipGenesis(): void {
    if (!this.destroyed) this.callbacks.onGenesisEnd?.()
  }

  enterStrata(request: StrataRequest): void {
    if (this.destroyed) return
    if (this.strataTransition.token === request.token) return
    if (!this.selected || this.selected.question.id !== request.questionId) {
      this.callbacks.onStrataError?.({
        token: request.token,
        questionId: request.questionId,
        scope: 'transition',
        cause: unsupported('请先选择对应的问题行星，再打开答案地层。'),
      })
      return
    }
    this.cancelFlight('strata')
    this.clearPointerFeedback()
    this.strataTransition.enter(request)
    this.lastStrataMoveAt = null
    const layout = this.strataTransition.layout
    if (layout) this.createCave(layout)
  }

  moveStrata(input: StrataMoveIntent): void {
    const now = performance.now()
    this.strataTransition.move(input, movementDeltaSeconds(this.lastStrataMoveAt, now))
    this.lastStrataMoveAt = now
  }
  focusAnswerSpecimen(answerId: string): void { this.strataTransition.focusAnswer(answerId) }
  closeAnswerSpecimen(): void { this.strataTransition.closeAnswer() }
  exitStrata(token: StrataToken): void { this.strataTransition.exit(token) }

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

    this.configureOverview(this.stars)
    this.createMacroOrbits(index)
    for (const planet of this.planets) this.createPlanet(planet)
    this.syncOrbitPresentation()

    this.scene.onBeforeRenderObservable.add(() => this.updateScene())
  }

  pickStrataAt(clientX: number, clientY: number): void {
    if (!this.universeVisible) this.pickAtClient(clientX, clientY)
  }

  private pickAtClient(clientX: number, clientY: number): void {
    if (this.destroyed) return
    const rect = this.canvas.getBoundingClientRect()
    const x = (clientX - rect.left) * this.engine.getRenderWidth() / Math.max(1, rect.width)
    const y = (clientY - rect.top) * this.engine.getRenderHeight() / Math.max(1, rect.height)
    const mesh = this.scene.pick(x, y)?.pickedMesh
    if (import.meta.env.VITE_E2E_DIAGNOSTICS === '1') {
      this.diagnosticClickEvents += 1
      this.diagnosticLastPick = !mesh ? 'none'
        : this.specimenByMeshId.has(mesh.uniqueId) ? 'specimen'
            : this.visualByMeshId.has(mesh.uniqueId) ? 'planet' : 'other'
    }
    if (!mesh) return
    const specimen = this.specimenByMeshId.get(mesh.uniqueId)
    if (specimen) {
      this.strataTransition.focusAnswer(specimen.answerId)
      return
    }
    const visual = this.visualByMeshId.get(mesh.uniqueId)
    if (visual) {
      const starId = 'id' in visual.datum.star.s ? visual.datum.star.s.id : ''
      if (starId) this.selectQuestionPlanet(starId, visual.datum.question.id)
      return
    }
  }

  private configureOverview(stars: readonly StarDatum[]): void {
    if (stars.length === 0) return
    const positions = stars
      .map((star) => Vector3.FromArray(star.p))
      .filter(finiteVector3)
    if (positions.length === 0) {
      this.overviewTarget = Vector3.Zero()
      this.overviewRadius = 30
      this.camera.setTarget(this.overviewTarget)
      this.camera.radius = this.overviewRadius
      return
    }
    const center = positions.reduce((sum, position) => sum.addInPlace(position), Vector3.Zero())
      .scaleInPlace(1 / positions.length)
    const extent = Math.max(8, ...positions.map((position) => Vector3.Distance(center, position)))
    this.overviewTarget = center
    this.overviewRadius = finitePositive(extent * 2.4) ? extent * 2.4 : 30
    this.camera.setTarget(center)
    this.camera.radius = this.overviewRadius
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
    mesh.parent = this.universeRoot
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
        'uCraterDensity', 'uReveal',
      ],
      needAlphaBlending: true,
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
    material.setFloat('uCraterDensity', descriptor.craterCount / 48)
    material.setFloat('uReveal', 0)
    mesh.material = material
    const orbit = this.createQuestionOrbit(datum)
    const visual = Object.freeze({ datum, descriptor, mesh, material, orbit })
    this.visualByQuestion.set(datum.question.id, visual)
    this.visualByMeshId.set(mesh.uniqueId, visual)
    this.updatePlanetPosition(visual, 0)
  }

  private createMacroOrbits(index: UniverseIndex): void {
    const dominantClusterIds = selectDominantClusterIds(index.universe.clusters)
    for (const cluster of index.universe.clusters) {
      if (!dominantClusterIds.has(cluster.g)) continue
      const color = starColor(cluster.hue, cluster.sat)
      const radii: number[] = []
      for (const member of cluster.mem) {
        const star = index.universe.stars.find((candidate) => candidate.c === member)
        if (!star) continue
        const radius = Math.hypot(
          star.p[0] - cluster.c[0],
          star.p[1] - cluster.c[1],
          star.p[2] - cluster.c[2],
        )
        radii.push(radius)
      }
      const radius = selectMacroOrbitRadius(radii)
      if (radius === null) continue
      const points = orbitRing(cluster.c, clusterAxis(cluster.g), radius, 96)
        .map((point) => Vector3.FromArray(point))
      if (points.length > 0) points.push(points[0].clone())
      const mesh = CreateLines(`cluster-orbit:${cluster.g}:${radius}`, { points, useVertexAlpha: true }, this.scene)
      mesh.parent = this.universeRoot
      mesh.color = new Color3(color[0], color[1], color[2]).scale(0.22)
      mesh.alpha = 0
      mesh.isPickable = false
      this.macroOrbits.push({ ownerKey: String(cluster.g), mesh })
    }
  }

  private createQuestionOrbit(datum: PlanetDatum): LinesMesh {
    const points: Vector3[] = []
    for (let index = 0; index <= 96; index += 1) {
      const angle = Math.PI * 2 * index / 96
      const cosine = Math.cos(angle)
      const sine = Math.sin(angle)
      points.push(new Vector3(
        datum.star.p[0] + (datum.u[0] * cosine + datum.v[0] * sine) * datum.orbitR,
        datum.star.p[1] + (datum.u[1] * cosine + datum.v[1] * sine) * datum.orbitR,
        datum.star.p[2] + (datum.u[2] * cosine + datum.v[2] * sine) * datum.orbitR,
      ))
    }
    const orbit = CreateLines(`question-orbit:${datum.question.id}`, { points, useVertexAlpha: true }, this.scene)
    orbit.parent = this.universeRoot
    orbit.color = new Color3(datum.star.color[0], datum.star.color[1], datum.star.color[2])
    orbit.alpha = 0
    orbit.isPickable = false
    return orbit
  }

  private orbitPresentationState(): OrbitPresentationState {
    if (!this.universeVisible) return { phase: 'strata' }
    const focusedOwnerKey = this.focusedStar ? starOwnerKey(this.focusedStar) : undefined
    if (this.selected) return {
      phase: 'planet-focus',
      focusedOwnerKey,
      selectedQuestionId: this.selected.question.id,
    }
    if (focusedOwnerKey && this.activeFlight) return {
      phase: 'approach',
      focusedOwnerKey,
      systemReveal: this.presentation.systemReveal,
    }
    return focusedOwnerKey ? { phase: 'star-focus', focusedOwnerKey } : { phase: 'panorama' }
  }

  private syncOrbitPresentation(): void {
    const state = this.orbitPresentationState()
    for (const orbit of this.macroOrbits) {
      applyOrbitLineAlpha(orbit.mesh, macroOrbitAlpha({ ...state, ownerKey: orbit.ownerKey }))
    }
    for (const visual of this.visualByQuestion.values()) {
      const ownerKey = starOwnerKey(visual.datum.star)
      applyOrbitLineAlpha(visual.orbit, questionOrbitAlpha({
        ...state,
        ownerKey,
        questionId: visual.datum.question.id,
      }))
      const planet = questionPlanetPresentation({ ...state, ownerKey })
      visual.material.setFloat('uReveal', planet.reveal)
      visual.mesh.setEnabled(planet.visible)
      visual.mesh.isPickable = planet.pickable
    }
  }

  private updateScene(): void {
    if (this.destroyed) return
    const deltaTime = Math.min(50, Math.max(0, this.engine.getDeltaTime()))
    this.elapsedMs += this.reducedMotion ? 0 : deltaTime
    this.updateCameraFlight(deltaTime)
    this.updateStellarPresentation(deltaTime)
    const renderHeight = Math.max(1, this.engine.getRenderHeight())
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    this.starLayer.update({
      elapsedMs: this.elapsedMs,
      renderHeight,
      devicePixelRatio: dpr,
      projectionScale: renderHeight * 0.5 / Math.tan(this.camera.fov * 0.5),
    })
    for (const visual of this.visualByQuestion.values()) {
      this.updatePlanetPosition(visual, this.elapsedMs)
      visual.material.setFloat('uTime', this.motionTime())
    }
    if (this.selectedVisual && this.universeVisible) {
      this.camera.target.copyFrom(this.selectedVisual.mesh.position)
      this.updateAnchor(this.selectedVisual.mesh)
    } else if (this.focusedStar && !this.activeFlight && this.universeVisible) {
      this.camera.target.copyFrom(this.currentStarPosition(this.focusedStar))
    }
    if (import.meta.env.VITE_E2E_DIAGNOSTICS === '1') recordE2EFrame(this, deltaTime)
  }

  private diagnosticPhase(): RenderSnapshot['scenePhase'] {
    switch (this.strataTransition.phase) {
      case 'surface-approach': return 'surface-approach'
      case 'surface-crossing': return 'surface-crossing'
      case 'strata-snapped': return 'strata-snapped'
      case 'strata-free': return 'strata-free'
      case 'exit': return 'strata-exiting'
      default: return 'universe'
    }
  }

  private diagnosticScene(): RenderSnapshot['scene'] {
    const firstStar = this.stars[0] ? this.projectToCss(this.currentStarPosition(this.stars[0])) : null
    return {
      planetCount: this.visualByQuestion.size,
      probeCount: this.probes.size,
      probeNearVisible: false,
      firstStarX: firstStar?.x ?? null,
      firstStarY: firstStar?.y ?? null,
      cameraDistance: this.camera.radius,
      targetDistance: this.camera.radius,
      cameraAlpha: this.camera.alpha,
      cameraBeta: this.camera.beta,
      cameraTargetX: this.camera.target.x,
      cameraTargetY: this.camera.target.y,
      cameraTargetZ: this.camera.target.z,
      strataPose: this.strataTransition.pose,
      undatedRoom: this.strataTransition.layout?.undatedRoom
        ? {
            centerDepth: this.strataTransition.layout.undatedRoom.centerDepth,
            angle: this.strataTransition.layout.undatedRoom.angle,
          }
        : null,
    }
  }

  private selectedPlanetBounds(): RenderSnapshot['projectedBounds']['selectedPlanet'] {
    const mesh = this.selectedVisual?.mesh
    if (!mesh || !this.universeVisible) return null
    mesh.computeWorldMatrix(true)
    const points = mesh.getBoundingInfo().boundingBox.vectorsWorld.map((point) => this.projectToCss(point))
    const minX = Math.min(...points.map(({ x }) => x))
    const maxX = Math.max(...points.map(({ x }) => x))
    const minY = Math.min(...points.map(({ y }) => y))
    const maxY = Math.max(...points.map(({ y }) => y))
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  private answerSpecimenDiagnostics(): NonNullable<RenderSnapshot['projectedBounds']['answerSpecimens']> {
    if (this.universeVisible) return []
    const rect = this.canvas.getBoundingClientRect()
    return [...this.specimenByMeshId.entries()].map(([meshId, specimen]) => {
      const mesh = this.scene.meshes.find(({ uniqueId }) => uniqueId === meshId)
      const identity = {
        answerId: specimen.answerId,
        room: specimen.room,
        depth: specimen.depth,
        x: specimen.x,
        z: specimen.z,
      }
      if (!mesh || !mesh.isEnabled()) return { ...identity, bounds: null }
      const point = this.projectToCss(mesh.getAbsolutePosition())
      const pick = this.scene.pick(
        point.x * this.engine.getRenderWidth() / Math.max(1, rect.width),
        point.y * this.engine.getRenderHeight() / Math.max(1, rect.height),
      )
      const visible = pick?.pickedMesh?.uniqueId === meshId && point.z >= 0 && point.z <= 1
        && point.x >= 12 && point.x <= rect.width - 12 && point.y >= 12 && point.y <= rect.height - 12
      return {
        ...identity,
        bounds: visible ? { x: point.x - 12, y: point.y - 12, width: 24, height: 24 } : null,
      }
    })
  }

  private firstAnswerSpecimenBounds(
    diagnostics: NonNullable<RenderSnapshot['projectedBounds']['answerSpecimens']>,
  ): NonNullable<RenderSnapshot['projectedBounds']['firstAnswerSpecimen']> | null {
    const rect = this.canvas.getBoundingClientRect()
    const candidates = diagnostics.flatMap(({ bounds }) => bounds ? [bounds] : [])
    if (candidates.length === 0) return null
    return candidates.reduce((best, candidate) => {
      const bestDistance = Math.hypot(best.x + best.width / 2 - rect.width / 2, best.y + best.height / 2 - rect.height / 2)
      const candidateDistance = Math.hypot(candidate.x + candidate.width / 2 - rect.width / 2, candidate.y + candidate.height / 2 - rect.height / 2)
      return candidateDistance < bestDistance ? candidate : best
    })
  }

  private projectToCss(point: Vector3): { x: number; y: number; z: number } {
    return this.projectToCssToRef(point, { x: 0, y: 0, z: 0 })
  }

  private projectToCssToRef<T extends { x: number; y: number; z: number }>(point: Vector3, result: T): T {
    const renderWidth = this.engine.getRenderWidth()
    const renderHeight = this.engine.getRenderHeight()
    const cameraViewport = this.camera.viewport
    const viewport = this.projectionViewport
    viewport.x = cameraViewport.x * renderWidth
    viewport.y = cameraViewport.y * renderHeight
    viewport.width = cameraViewport.width * renderWidth
    viewport.height = cameraViewport.height * renderHeight
    const projected = this.projectedPositionScratch
    Vector3.ProjectToRef(point, this.projectionIdentity, this.scene.getTransformMatrix(), viewport, projected)
    const rect = this.canvas.getBoundingClientRect()
    result.x = projected.x * rect.width / Math.max(1, renderWidth)
    result.y = projected.y * rect.height / Math.max(1, renderHeight)
    result.z = projected.z
    return result
  }

  private updatePlanetPosition(visual: PlanetVisual, elapsedMs: number): void {
    const datum = visual.datum
    const motionTime = this.reducedMotion ? 0 : elapsedMs
    const starPosition = starWorldPosition(
      datum.star,
      motionTime,
      this.reducedMotion ? 0 : 1.35,
      this.planetStarPositionScratch,
    )
    const angle = datum.phase + Math.PI * 2 / datum.period * (motionTime / 1000)
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    visual.mesh.position.set(
      starPosition.x + (datum.u[0] * cosine + datum.v[0] * sine) * datum.orbitR,
      starPosition.y + (datum.u[1] * cosine + datum.v[1] * sine) * datum.orbitR,
      starPosition.z + (datum.u[2] * cosine + datum.v[2] * sine) * datum.orbitR,
    )
    visual.orbit.position.set(
      starPosition.x - datum.star.p[0],
      starPosition.y - datum.star.p[1],
      starPosition.z - datum.star.p[2],
    )
    visual.mesh.rotation.y = angle * 0.37 + datum.material.seed * Math.PI * 2
  }

  private updateAnchor(mesh: Mesh): void {
    if (!this.callbacks.onAnchor) return
    const renderWidth = this.engine.getRenderWidth()
    const renderHeight = this.engine.getRenderHeight()
    const cameraViewport = this.camera.viewport
    const viewport = this.projectionViewport
    viewport.x = cameraViewport.x * renderWidth
    viewport.y = cameraViewport.y * renderHeight
    viewport.width = cameraViewport.width * renderWidth
    viewport.height = cameraViewport.height * renderHeight
    const projected = this.projectedPositionScratch
    Vector3.ProjectToRef(
      mesh.getAbsolutePosition(), this.projectionIdentity, this.scene.getTransformMatrix(), viewport, projected,
    )
    const visible = projected.z >= 0 && projected.z <= 1
    this.callbacks.onAnchor(projected.x, projected.y, visible)
  }

  private captureStrataEntryPose(): Readonly<{ depth: number; yaw: number; pitch: number; snapId: null }> {
    this.entryCameraSnapshot = Object.freeze({
      alpha: this.camera.alpha,
      beta: this.camera.beta,
      radius: this.camera.radius,
      target: this.camera.target.clone(),
    })
    return Object.freeze({
      depth: this.camera.radius,
      yaw: this.camera.alpha,
      pitch: this.camera.beta,
      snapId: null,
    })
  }

  private applyStrataPose(pose: Readonly<{ depth: number; yaw: number; pitch: number }>): void {
    if (this.destroyed) return
    if (this.universeVisible) {
      const snapshot = this.entryCameraSnapshot
      if (snapshot) this.camera.setTarget(snapshot.target)
      this.camera.alpha = pose.yaw
      this.camera.beta = pose.pitch
      this.camera.radius = pose.depth
      return
    }
    const position = new Vector3(0, -pose.depth, 0)
    const horizontal = Math.cos(pose.pitch)
    const direction = new Vector3(
      Math.sin(pose.yaw) * horizontal,
      Math.sin(pose.pitch),
      Math.cos(pose.yaw) * horizontal,
    )
    this.camera.setPosition(position)
    this.camera.setTarget(position.add(direction))
  }

  private setUniverseVisible(visible: boolean): void {
    if (this.destroyed) return
    this.universeVisible = visible
    this.universeRoot.setEnabled(visible)
    this.caveRoot?.setEnabled(!visible)
    this.scene.fogEnabled = !visible
    if (visible && !this.workspaceOpen) this.camera.attachControl(this.canvas, true)
    else this.camera.detachControl()
    if (!visible) this.clearPointerFeedback()
    this.syncOrbitPresentation()
  }

  private animateStrata(
    phase: StrataAnimationPhase,
    _token: StrataToken,
    complete: () => void,
    fail: (cause: Error) => void,
  ): () => void {
    if (this.destroyed) return () => {}
    if (phase === 'surface-crossing') this.caveRoot?.setEnabled(true)
    const startTarget = this.camera.target.clone()
    const startRadius = this.camera.radius
    const selectedPosition = this.selectedVisual?.mesh.position.clone() ?? startTarget
    const endTarget = phase === 'surface-approach'
      ? selectedPosition
      : phase === 'exit' ? new Vector3(0, -0.35, 1) : new Vector3(0, -1, 1)
    const endRadius = phase === 'surface-approach'
      ? Math.max(0.7, (this.selectedVisual?.descriptor.radius ?? 0.7) * 0.82)
      : 0.9
    const duration = this.reducedMotion ? 0 : phase === 'surface-approach' ? 720 : 560
    let elapsed = 0
    let cancelled = false
    const observer = this.scene.onBeforeRenderObservable.add(() => {
      if (cancelled || this.destroyed) return
      try {
        elapsed += Math.max(1, this.engine.getDeltaTime())
        const progress = duration === 0 ? 1 : Math.min(1, elapsed / duration)
        const eased = progress * progress * (3 - 2 * progress)
        this.camera.setTarget(Vector3.Lerp(startTarget, endTarget, eased))
        this.camera.radius = startRadius + (endRadius - startRadius) * eased
        if (progress < 1) return
        this.scene.onBeforeRenderObservable.remove(observer)
        complete()
      } catch (cause) {
        this.scene.onBeforeRenderObservable.remove(observer)
        fail(cause instanceof Error ? cause : new Error(String(cause)))
      }
    })
    return () => {
      if (cancelled) return
      cancelled = true
      this.scene.onBeforeRenderObservable.remove(observer)
    }
  }

  private createCave(layout: CaveLayout): void {
    this.specimenByMeshId.clear()
    this.caveRoot?.dispose(false, true)
    const root = new TransformNode('answer-strata-root', this.scene)
    this.caveRoot = root

    const layerColors = [
      new Color3(0.28, 0.19, 0.14),
      new Color3(0.18, 0.23, 0.25),
      new Color3(0.30, 0.25, 0.17),
      new Color3(0.17, 0.20, 0.27),
    ]
    const renderLayers = layout.layers.length > 0
      ? layout.layers
      : [{ id: 'surface-observation-room', centerDepth: 2.5, thickness: 5, colorIndex: 1, openingAngle: null }]
    for (const layer of renderLayers) {
      const wall = CreateCylinder(`cave-wall:${layer.id}`, {
        height: layer.thickness + 0.12,
        diameter: layout.bounds.radius * 2,
        tessellation: 18,
        subdivisions: 3,
        cap: CAVE_CYLINDER_CAP === 'none' ? Mesh.NO_CAP : Mesh.CAP_ALL,
        arc: layer.openingAngle === null || !layout.undatedRoom
          ? 1
          : undatedPassageGeometry(layout.undatedRoom).wallArc,
        enclose: false,
      }, this.scene)
      wall.parent = root
      wall.position.y = -layer.centerDepth
      wall.rotation.y = layer.openingAngle === null || !layout.undatedRoom
        ? layer.colorIndex * 0.21
        : undatedPassageGeometry(layout.undatedRoom).wallRotationY
      wall.scaling.x = 1 + Math.sin(layer.centerDepth * 1.7) * 0.055
      wall.scaling.z = 1 + Math.cos(layer.centerDepth * 1.3) * 0.07
      // Opaque cave geometry must participate in picking so diagnostics and user
      // input cannot select specimens through a sealed wall.
      wall.isPickable = true
      const material = new StandardMaterial(`${wall.name}:material`, this.scene)
      const base = layerColors[layer.colorIndex % layerColors.length]
      material.diffuseColor = base
      material.emissiveColor = base.scale(0.36)
      material.specularColor = new Color3(0.045, 0.055, 0.06)
      material.backFaceCulling = false
      material.twoSidedLighting = true
      wall.material = material

      const seam = CreateCylinder(`cave-seam:${layer.id}`, {
        height: 0.10,
        diameter: layout.bounds.radius * 1.96,
        tessellation: 22,
        cap: CAVE_CYLINDER_CAP === 'none' ? Mesh.NO_CAP : Mesh.CAP_ALL,
      }, this.scene)
      seam.parent = root
      seam.position.y = -(layer.centerDepth + layer.thickness / 2)
      seam.isPickable = false
      const seamMaterial = new StandardMaterial(`${seam.name}:material`, this.scene)
      seamMaterial.diffuseColor = new Color3(0.035, 0.085, 0.10)
      seamMaterial.emissiveColor = new Color3(0.035, 0.19, 0.22)
      seamMaterial.backFaceCulling = false
      seam.material = seamMaterial
    }

    this.createCaveCap(root, layout)
    this.createUndatedRoom(root, layout)
    for (const specimen of layout.specimens) this.createSpecimen(root, specimen)
    this.createCaveDust(root, layout)
    this.createCaveLights(root, layout)
    this.scene.fogMode = Scene.FOGMODE_EXP2
    this.scene.fogDensity = 0.028
    this.scene.fogColor = new Color3(0.012, 0.018, 0.025)
    root.setEnabled(false)
  }

  private createCaveCap(root: TransformNode, layout: CaveLayout): void {
    const capDepth = layout.blockedDepth ? layout.bounds.maxDepth : layout.bounds.maxDepth + 0.25
    const cap = CreateCylinder('cave-depth-cap', {
      height: 0.55,
      diameter: layout.bounds.radius * 1.94,
      tessellation: 18,
    }, this.scene)
    cap.parent = root
    cap.position.y = -capDepth
    const material = new StandardMaterial('cave-depth-cap:material', this.scene)
    material.diffuseColor = layout.blockedDepth ? new Color3(0.22, 0.16, 0.12) : new Color3(0.08, 0.10, 0.12)
    material.emissiveColor = layout.blockedDepth ? new Color3(0.06, 0.025, 0.012) : Color3.Black()
    material.specularColor = Color3.Black()
    cap.material = material

    const crack = CreateIcoSphere('surface-crossing-crack', { radius: 1, subdivisions: 2 }, this.scene)
    crack.parent = root
    crack.position.set(0, -0.2, layout.bounds.radius - 0.35)
    crack.scaling.set(1.9, 0.10, 0.16)
    crack.isPickable = false
    const crackMaterial = new StandardMaterial('surface-crossing-crack:material', this.scene)
    crackMaterial.diffuseColor = new Color3(0.15, 0.44, 0.56)
    crackMaterial.emissiveColor = new Color3(0.12, 0.68, 0.92)
    crack.material = crackMaterial
  }

  private createSpecimen(root: TransformNode, specimen: CaveSpecimenPlacement): void {
    const mesh = CreateIcoSphere(`answer-specimen:${specimen.answerId}`, { radius: 1, subdivisions: 2 }, this.scene)
    mesh.parent = root
    mesh.position.set(specimen.x, -specimen.depth, specimen.z)
    mesh.scaling.set(specimen.scale * 0.72, specimen.scale * 1.65, specimen.scale)
    mesh.rotation.set(specimen.depth * 0.17, specimen.x * 0.23, specimen.z * 0.19)
    mesh.isPickable = true
    mesh.metadata = { answerId: specimen.answerId }
    const material = new StandardMaterial(`${mesh.name}:material`, this.scene)
    const created = specimen.relations.includes('created')
    material.diffuseColor = created ? new Color3(0.66, 0.38, 0.13) : new Color3(0.37, 0.53, 0.61)
    material.emissiveColor = created ? new Color3(0.42, 0.18, 0.04) : new Color3(0.08, 0.16, 0.20)
    material.specularColor = specimen.relations.includes('collected')
      ? new Color3(0.35, 0.67, 0.88)
      : new Color3(0.14, 0.19, 0.21)
    material.specularPower = 72
    mesh.material = material
    this.specimenByMeshId.set(mesh.uniqueId, specimen)
  }

  private createUndatedRoom(root: TransformNode, layout: CaveLayout): void {
    const room = layout.undatedRoom
    if (!room) return
    const chamber = CreateSphere('undated-debris-room', {
      diameter: room.radius * 2,
      segments: 14,
      arc: room.openArc,
      slice: 1,
    }, this.scene)
    chamber.parent = root
    chamber.position.set(room.x, -room.centerDepth, room.z)
    chamber.rotation.y = room.angle + Math.PI * 0.64
    chamber.scaling.y = 0.78
    chamber.isPickable = true
    const chamberMaterial = new StandardMaterial('undated-debris-room:material', this.scene)
    chamberMaterial.diffuseColor = new Color3(0.16, 0.19, 0.22)
    chamberMaterial.emissiveColor = new Color3(0.025, 0.055, 0.065)
    chamberMaterial.specularColor = new Color3(0.04, 0.06, 0.07)
    chamberMaterial.backFaceCulling = false
    chamberMaterial.twoSidedLighting = true
    chamber.material = chamberMaterial

    const distance = Math.hypot(room.x, room.z)
    const tunnel = CreateCylinder('undated-debris-tunnel', {
      height: Math.max(1, distance - layout.bounds.radius + room.radius * 0.7),
      diameter: 1.8,
      tessellation: 14,
      cap: Mesh.NO_CAP,
    }, this.scene)
    tunnel.parent = root
    tunnel.position.set(room.x * 0.63, -room.centerDepth, room.z * 0.63)
    const passage = undatedPassageGeometry(room)
    const tunnelDirection = new Vector3(passage.tunnelDirection.x, 0, passage.tunnelDirection.z)
    tunnel.rotationQuaternion = Quaternion.Identity()
    Quaternion.FromUnitVectorsToRef(Vector3.Up(), tunnelDirection, tunnel.rotationQuaternion)
    tunnel.isPickable = true
    tunnel.material = chamberMaterial
  }

  private createCaveDust(root: TransformNode, layout: CaveLayout): void {
    const material = new StandardMaterial('cave-dust:material', this.scene)
    material.disableLighting = true
    material.emissiveColor = new Color3(0.18, 0.29, 0.32)
    material.alpha = 0.38
    for (let index = 0; index < 24; index += 1) {
      const dust = CreateSphere(`cave-dust:${index}`, { diameter: 0.026 + index % 3 * 0.009, segments: 4 }, this.scene)
      dust.parent = root
      const angle = index * 2.399963
      const radius = 0.7 + index % 7 * 0.48
      dust.position.set(
        Math.sin(angle) * radius,
        -(0.8 + index / 23 * Math.max(1, layout.bounds.maxDepth - 1.2)),
        Math.cos(angle) * radius,
      )
      dust.isPickable = false
      dust.material = material
    }
  }

  private createCaveLights(root: TransformNode, layout: CaveLayout): void {
    const depths = layout.layers.length > 0
      ? layout.layers.map(({ centerDepth }) => centerDepth)
      : [2.2]
    for (const [index, depth] of depths.entries()) {
      const light = new PointLight(`cave-light:${index}`, new Vector3(
        index % 2 === 0 ? 2.4 : -2.4,
        -depth,
        index % 3 === 0 ? 1.7 : -1.7,
      ), this.scene)
      light.parent = root
      light.diffuse = index % 2 === 0 ? new Color3(0.22, 0.52, 0.66) : new Color3(0.58, 0.31, 0.16)
      light.intensity = 0.72
      light.range = 9
    }
  }

  private applyStarFocus(star: StarDatum): boolean {
    try {
      this.clearPlanet()
      this.focusedStar = star
      const starKey = starIdentity(star.s)
      const target = this.currentStarPosition(star)
      this.starLayer.setFocus(starKey, star)
      const framing = this.systemFraming(star)
      const distance = Vector3.Distance(this.camera.target, target)
      if (!finiteVector3(target)
        || !finiteVector3(this.camera.target)
        || !finitePositive(this.camera.radius)
        || !finitePositive(star.bodyR)
        || !finitePositive(this.overviewRadius)
        || !Number.isFinite(distance)) {
        throw new Error('Invalid camera flight input')
      }
      const result = this.cameraFlightController.start({
        starKey,
        start: { target: this.camera.target, radius: this.camera.radius },
        targetStar: target,
        bodyR: star.bodyR,
        systemExtent: framing.extent,
        overviewRadius: this.overviewRadius,
        distance,
        requestedMs: 1100,
        reducedMotion: this.reducedMotion,
      })
      if (result.kind === 'started') {
        this.activeFlight = Object.freeze({ flight: result.flight, elapsedMs: 0 })
        this.presentation = describeStarPresentation({ phase: 'approach', approachProgress: 0 })
      } else if (result.kind === 'noop') {
        this.activeFlight = null
        this.camera.setTarget(target)
        this.camera.radius = framing.radius
        this.presentation = describeStarPresentation({ phase: 'star-focus' })
      } else {
        throw new Error('Invalid camera flight input')
      }
      this.syncStarLayerPresentation()
      this.syncOrbitPresentation()
      return true
    } catch (cause) {
      this.recoverCamera(cause)
      return false
    }
  }

  private systemFraming(star: StarDatum): Readonly<{ extent: number; radius: number }> {
    const extents = this.planets
      .filter((planet) => planet.star === star)
      .map(({ orbitR, radius }) => ({ orbitR, radius }))
    const extent = computeSystemExtent(star.bodyR, extents)
    const minimum = star.bodyR * 8
    const maximum = this.overviewRadius * 0.72
    if (!extent.ok || !finitePositive(minimum) || !finitePositive(maximum) || minimum > maximum) {
      throw new Error('Invalid camera flight input')
    }
    const radius = Math.min(maximum, Math.max(minimum, star.bodyR * 14, extent.value * 1.35))
    if (!finitePositive(radius)) throw new Error('Invalid camera flight input')
    return Object.freeze({ extent: extent.value, radius })
  }

  private applyModeDimensions(): void {
    const dimensions = this.stars.map(({ s }) => renderDim(s, this.mode, this.universe, this.wormIdx))
    this.interactionByDatum.clear()
    for (const datum of this.stars) {
      this.interactionByDatum.set(datum, starInteractionEligible(datum.s, this.mode, this.universe, this.wormIdx))
    }
    this.starLayer.setDimensions(dimensions)
  }

  private isInteractive(star: StarDatum): boolean {
    return this.interactionByDatum.get(star) === true
  }

  private isKeyInteractive(starKey: string): boolean {
    return resolveInteractiveStar(this.stars, starKey, this.mode, this.universe, this.wormIdx) !== null
  }

  private currentStarPosition(star: StarDatum): Vector3 {
    return starWorldPosition(star, this.motionTime(), this.reducedMotion ? 0 : 1.35, this.starPositionScratch)
  }

  private motionTime(): number {
    return this.reducedMotion ? 0 : this.elapsedMs
  }

  private cancelFlight(reason: Parameters<CameraFlightController['cancel']>[0]): void {
    this.cameraFlightController.cancel(reason)
    this.activeFlight = null
    this.presentation = describeStarPresentation({
      phase: this.selected ? 'planet-focus' : this.focusedStar ? 'star-focus' : 'panorama',
    })
    this.lastPresentationInput = null
  }

  private updateCameraFlight(deltaTime: number): void {
    const active = this.activeFlight
    if (!active) return
    const elapsedMs = active.elapsedMs + deltaTime
    const result = this.cameraFlightController.frame(active.flight, elapsedMs)
    if (!result.ok) {
      if (result.error === 'invalid-frame') this.recoverCamera(new Error('Invalid camera flight frame'))
      return
    }
    try {
      const { frame } = result
      if (![frame.target.x, frame.target.y, frame.target.z, frame.radius].every(Number.isFinite)
        || frame.radius <= 0) throw new Error('Invalid camera flight pose')
      const progress = frame.progress * frame.progress * (3 - 2 * frame.progress)
      const liveTarget = this.focusedStar ? this.currentStarPosition(this.focusedStar) : null
      const target = this.flightTargetScratch.set(frame.target.x, frame.target.y, frame.target.z)
      if (liveTarget) {
        target.x += (liveTarget.x - active.flight.to.target.x) * progress
        target.y += (liveTarget.y - active.flight.to.target.y) * progress
        target.z += (liveTarget.z - active.flight.to.target.z) * progress
      }
      if (!finiteVector3(target)) throw new Error('Invalid camera flight target')
      this.camera.setTarget(target)
      this.camera.radius = frame.radius
      this.presentation = describeStarPresentation({ phase: 'approach', approachProgress: frame.progress })
      this.activeFlight = frame.complete ? null : Object.freeze({ flight: active.flight, elapsedMs })
      if (frame.complete) this.presentation = describeStarPresentation({ phase: 'star-focus' })
      this.lastPresentationInput = null
      this.syncOrbitPresentation()
    } catch (cause) {
      this.recoverCamera(cause)
    }
  }

  private recoverCamera(cause: unknown): void {
    const original = cause instanceof Error ? cause : new Error(String(cause))
    attemptRecovery(() => this.cameraFlightController.cancel('reset'))
    this.activeFlight = null
    let focusedPosition: Vector3 | null = null
    if (this.focusedStar) {
      attemptRecovery(() => { focusedPosition = this.currentStarPosition(this.focusedStar as StarDatum) })
    }
    let recoveryRadius: number | null = null
    if (this.focusedStar) {
      attemptRecovery(() => { recoveryRadius = this.systemFraming(this.focusedStar as StarDatum).radius })
    }
    let validFocus = this.focusedStar
      && this.isInteractive(this.focusedStar)
      && finitePositive(this.focusedStar.bodyR)
      && focusedPosition
      && finiteVector3(focusedPosition)
      && recoveryRadius !== null
      ? this.focusedStar : null
    if (validFocus) {
      const recoveryFocus = validFocus
      let focusSynchronized = false
      attemptRecovery(() => {
        this.starLayer.setFocus(starIdentity(recoveryFocus.s), recoveryFocus)
        focusSynchronized = true
      })
      if (!focusSynchronized) validFocus = null
    }
    attemptRecovery(() => this.pointerPresentation.clear())
    attemptRecovery(() => this.applyPointerPresentationFeedback(false))
    if (validFocus && focusedPosition && recoveryRadius !== null) {
      let poseSynchronized = false
      attemptRecovery(() => {
        this.camera.setTarget(focusedPosition as Vector3)
        this.camera.radius = recoveryRadius as number
        poseSynchronized = true
      })
      if (!poseSynchronized) validFocus = null
    }
    if (validFocus) {
      this.presentation = describeStarPresentation({ phase: 'star-focus' })
    } else {
      this.focusedStar = null
      attemptRecovery(() => this.starLayer.setFocus(null, null))
      this.overviewTarget = finiteVector3(this.overviewTarget) ? this.overviewTarget : Vector3.Zero()
      this.overviewRadius = finitePositive(this.overviewRadius) ? this.overviewRadius : 30
      attemptRecovery(() => this.camera.setTarget(this.overviewTarget))
      attemptRecovery(() => { this.camera.radius = this.overviewRadius })
      this.presentation = describeStarPresentation({ phase: 'panorama' })
    }
    attemptRecovery(() => this.syncStarLayerPresentation())
    this.lastPresentationInput = null
    attemptRecovery(() => this.syncOrbitPresentation())
    this.callbacks.onRenderError?.(original)
  }

  private updateStellarPresentation(deltaTime: number): void {
    const hoverTarget = this.hoverKey ? 1 : 0
    const hoverStep = this.reducedMotion ? 1 : Math.min(1, deltaTime / HOVER_INTERPOLATION_MS)
    this.hoverProgress += (hoverTarget - this.hoverProgress) * hoverStep
    this.pressedProgress = this.pressedKey ? 1 : 0
    const phase = !this.universeVisible ? 'strata'
      : this.selected ? 'planet-focus'
        : this.activeFlight ? 'approach'
          : this.focusedStar ? 'star-focus' : 'panorama'
    const approachProgress = this.activeFlight && this.activeFlight.flight.durationMs > 0
      ? this.activeFlight.elapsedMs / this.activeFlight.flight.durationMs
      : undefined
    const input: NonNullable<typeof this.lastPresentationInput> = {
      phase,
      approachProgress,
      hoverProgress: this.hoverProgress,
      pressedProgress: this.pressedProgress,
    }
    const previous = this.lastPresentationInput
    if (previous
      && previous.phase === input.phase
      && previous.approachProgress === input.approachProgress
      && previous.hoverProgress === input.hoverProgress
      && previous.pressedProgress === input.pressedProgress) return
    this.presentation = describeStarPresentation(input)
    this.lastPresentationInput = Object.freeze(input)
    this.syncStarLayerPresentation()
  }

  private installPointerListeners(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown)
    this.canvas.addEventListener('pointermove', this.onPointerMove)
    this.canvas.addEventListener('pointerup', this.onPointerUp)
    this.canvas.addEventListener('pointercancel', this.onPointerCancel)
    this.canvas.addEventListener('lostpointercapture', this.onLostPointerCapture)
    this.canvas.addEventListener('pointerleave', this.onPointerLeave)
    this.canvas.addEventListener('wheel', this.onWheel)
    window.addEventListener('keydown', this.onKeyDown)
  }

  private removePointerListeners(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown)
    this.canvas.removeEventListener('pointermove', this.onPointerMove)
    this.canvas.removeEventListener('pointerup', this.onPointerUp)
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel)
    this.canvas.removeEventListener('lostpointercapture', this.onLostPointerCapture)
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave)
    this.canvas.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('keydown', this.onKeyDown)
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (this.destroyed || this.workspaceOpen) return
    this.canvas.focus({ preventScroll: true })
    this.cancelFlight('user')
    const target = this.pointerTarget(event.clientX, event.clientY, pointerKind(event.pointerType))
    this.pointerPresentation.pointerDown({
      pointerId: event.pointerId,
      inputKind: pointerKind(event.pointerType),
      x: event.clientX,
      y: event.clientY,
      starKey: target,
    })
    this.applyPointerPresentationFeedback()
    try { this.canvas.setPointerCapture(event.pointerId) } catch { /* detached canvas */ }
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (this.destroyed || this.workspaceOpen) return
    const gesture = this.pointerPresentation.gestureSnapshot()
    const target = gesture.activePointerId === null && !gesture.multiPointerInvalidated
      ? this.pointerTarget(event.clientX, event.clientY, pointerKind(event.pointerType))
      : null
    this.pointerPresentation.pointerMove({
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      starKey: target,
    })
    this.applyPointerPresentationFeedback()
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (this.destroyed) return
    const before = this.pointerPresentation.gestureSnapshot()
    const target = this.pointerTarget(event.clientX, event.clientY, pointerKind(event.pointerType))
    const chosen = this.pointerPresentation.pointerUp({
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      starKey: target,
    })
    if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
    this.applyPointerPresentationFeedback()
    if (chosen) {
      if (import.meta.env.VITE_E2E_DIAGNOSTICS === '1') {
        this.diagnosticClickEvents += 1
        this.diagnosticLastPick = chosen.startsWith('star:') ? 'star'
          : chosen.startsWith('planet:') ? 'planet'
            : chosen.startsWith('specimen:') ? 'specimen' : 'other'
      }
      this.activatePointerTarget(chosen)
    }
    else if (before.activePointerId === event.pointerId
      && !before.cancelled
      && !before.multiPointerInvalidated
      && before.accumulatedMovement < 6
      && before.pressedStarKey === null
      && target === null) this.exitHierarchy()
  }

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.pointerPresentation.pointerCancel(event.pointerId)
    this.applyPointerPresentationFeedback()
  }

  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    this.pointerPresentation.lostPointerCapture(event.pointerId)
    this.applyPointerPresentationFeedback()
  }

  private readonly onPointerLeave = (): void => {
    this.pointerPresentation.pointerLeave()
    this.applyPointerPresentationFeedback()
  }

  private readonly onWheel = (event: WheelEvent): void => {
    if (this.destroyed || this.workspaceOpen) return
    this.cancelFlight('user')
    const threshold = this.selected
      ? Math.max(8, this.focusedStar?.bodyR ?? 1) * 0.85
      : this.overviewRadius * 0.9
    if (shouldExitOnWheel(event.deltaY, this.camera.radius, threshold)) this.exitHierarchy()
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && !this.destroyed && !this.workspaceOpen) this.exitHierarchy()
  }

  private pointerTarget(clientX: number, clientY: number, inputKind: PointerInputKind): string | null {
    if (!this.universeVisible) return this.sceneTarget(clientX, clientY)
    const higher = this.sceneTarget(clientX, clientY)
    if (higher) return higher
    const rect = this.canvas.getBoundingClientRect()
    const candidates = this.candidateBuffer.update(
      this.motionTime(),
      this.reducedMotion ? 0 : 1.35,
      (world, datum) => {
        const projected = this.projectToCssToRef(
          this.candidateWorldScratch.set(world.x, world.y, world.z),
          this.pointerProjectionScratch,
        )
        const candidate = this.candidateProjectionScratch
        candidate.x = projected.x
        candidate.y = projected.y
        candidate.depth = projected.z
        candidate.visible = this.universeVisible && this.isInteractive(datum)
        return candidate
      },
    )
    const picked = pickProjectedStar({
      x: clientX - rect.left,
      y: clientY - rect.top,
      inputKind,
      viewport: { width: rect.width, height: rect.height },
    }, candidates)
    return picked ? `star:${picked.starKey}` : null
  }

  private sceneTarget(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect()
    const x = (clientX - rect.left) * this.engine.getRenderWidth() / Math.max(1, rect.width)
    const y = (clientY - rect.top) * this.engine.getRenderHeight() / Math.max(1, rect.height)
    const mesh = this.scene.pick(x, y)?.pickedMesh
    if (!mesh) return null
    const specimen = this.specimenByMeshId.get(mesh.uniqueId)
    if (specimen) return `specimen:${specimen.answerId}`
    const visual = this.visualByMeshId.get(mesh.uniqueId)
    return visual && visual.mesh.isEnabled() && visual.mesh.isPickable
      ? `planet:${visual.datum.question.id}` : null
  }

  private activatePointerTarget(target: string): void {
    if (target.startsWith('star:')) {
      this.focusStar(target.slice(5))
      return
    }
    if (target.startsWith('planet:')) {
      const visual = this.visualByQuestion.get(target.slice(7))
      const starId = visual && 'id' in visual.datum.star.s ? visual.datum.star.s.id : null
      if (visual && starId) this.selectQuestionPlanet(starId, visual.datum.question.id)
      return
    }
    if (target.startsWith('specimen:')) this.strataTransition.focusAnswer(target.slice(9))
  }

  private exitHierarchy(): void {
    const target = exitTarget(!this.universeVisible ? 'strata'
      : this.selected ? 'planet-focus'
        : this.activeFlight ? 'star-focus'
          : this.focusedStar ? 'star-focus' : 'panorama')
    if (target === 'star-focus') this.clearPlanet()
    else if (target === 'panorama') {
      this.resetView()
      this.callbacks.onPick?.(null)
    }
  }

  private clearPointerFeedback(): void {
    this.pointerPresentation.clear()
    this.applyPointerPresentationFeedback()
    this.hoverProgress = 0
    this.pressedProgress = 0
  }

  private applyPointerPresentationFeedback(syncLayer = true): void {
    const feedback = this.pointerPresentation.snapshot()
    this.hoverKey = feedback.hoverStarKey
    this.pressedKey = feedback.pressedStarKey
    this.canvas.style.cursor = feedback.cursor
    if (syncLayer) this.syncStarLayerPresentation()
  }

  private syncStarLayerPresentation(): void {
    if (this.lastLayerPresentation === this.presentation
      && this.lastLayerHoverKey === this.hoverKey
      && this.lastLayerPressedKey === this.pressedKey) return
    this.starLayer.setPresentation(this.presentation, this.hoverKey, this.pressedKey)
    this.lastLayerPresentation = this.presentation
    this.lastLayerHoverKey = this.hoverKey
    this.lastLayerPressedKey = this.pressedKey
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

function starOwnerKey(star: StarDatum): string {
  return 'id' in star.s ? star.s.id : star.s.c
}

function unsupported(message: string): Error {
  const cause = new Error(message)
  cause.name = 'UnsupportedRendererFeatureError'
  return cause
}

function pointerKind(value: string): PointerInputKind {
  return value === 'touch' || value === 'pen' ? value : 'mouse'
}

function finiteVector3(value: { readonly x: number; readonly y: number; readonly z: number }): boolean {
  return [value.x, value.y, value.z].every(Number.isFinite)
}

function finitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function attemptRecovery(operation: () => void): void {
  try { operation() } catch { /* preserve and report the original camera failure */ }
}

function releaseCanvasWebGLContext(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
  context?.getExtension('WEBGL_lose_context')?.loseContext()
}

export function buildPlanetBookkeeping(
  index: UniverseIndex,
  stars: readonly StarDatum[],
): readonly PlanetDatum[] {
  const timeline = buildMaterialTimeline([...index.answersById.values()])
  const planets: PlanetDatum[] = []
  for (const star of stars) {
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
