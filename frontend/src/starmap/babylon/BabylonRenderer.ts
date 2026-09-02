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
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js'
import { selectPlanetData, type UniverseIndex } from '../../domain/universe'
import type { Mode } from '../../types'
import { buildMaterialTimeline, planetMaterialInput } from '../gl/planetMaterials'
import { installE2EDiagnostics, recordE2EFrame, removeE2EDiagnostics, type RenderSnapshot } from '../e2eDiagnostics'
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
import {
  CAVE_CYLINDER_CAP,
  movementDeltaSeconds,
  undatedPassageGeometry,
  type CaveLayout,
  type CaveSpecimenPlacement,
} from './strataScene'
import { StrataTransitionController, type StrataAnimationPhase } from './strataTransition'

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
  private caveRoot: TransformNode | null = null
  private readonly planets: readonly PlanetDatum[]
  private readonly visualByQuestion = new Map<string, PlanetVisual>()
  private readonly visualByMeshId = new Map<number, PlanetVisual>()
  private readonly starByMeshId = new Map<number, StarDatum>()
  private readonly specimenByMeshId = new Map<number, CaveSpecimenPlacement>()
  private readonly probes: ReadonlySet<string>
  private readonly strataTransition: StrataTransitionController
  private selected: PlanetDatum | null = null
  private selectedVisual: PlanetVisual | null = null
  private focusedStar: StarDatum | null = null
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
      throw new BabylonWebGL2RequiredError()
    }
    this.engine = engine

    let scene: Scene | null = null
    let runtimeConstructionStarted = false
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
      this.strataTransition = new StrataTransitionController({
        capturePose: () => this.captureStrataEntryPose(),
        applyPose: (pose) => this.applyStrataPose(pose),
        setUniverseVisible: (visible) => this.setUniverseVisible(visible),
        animate: (phase, token, complete, fail) => this.animateStrata(phase, token, complete, fail),
      }, callbacks)
      this.createScene(index)
      canvas.addEventListener('click', this.onCanvasClick)
      runtimeConstructionStarted = true
      this.runtime = new BabylonRuntime({
        engine,
        scene,
        releaseContext: () => canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext(),
        canvas: {
          addEventListener: (type, listener) => canvas.addEventListener(type, listener),
          removeEventListener: (type, listener) => canvas.removeEventListener(type, listener),
        },
      }, {
        onReady: callbacks.onRenderReady,
        onError: callbacks.onRenderError,
      })
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
                listeners: runtime.listeners + (this.destroyed ? 0 : 1),
                clickEvents: this.diagnosticClickEvents,
                lastPick: this.diagnosticLastPick,
              }
            },
          },
        )
      }
      activeBabylonRenderers.add(this)
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
    activeBabylonRenderers.delete(this)
    this.selected = null
    this.selectedVisual = null
    this.strataTransition.destroy()
    this.canvas.removeEventListener('click', this.onCanvasClick)
    if (import.meta.env.VITE_E2E_DIAGNOSTICS === '1') removeE2EDiagnostics(this)
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
    this.workspaceOpen = open
    this.canvas.style.pointerEvents = open ? 'none' : ''
    if (open) this.camera.detachControl()
    else if (this.universeVisible) this.camera.attachControl(this.canvas, true)
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

    const stars = starData(index.universe)
    this.configureOverview(stars)
    for (const star of stars) this.createStar(star)
    for (const planet of this.planets) this.createPlanet(planet)

    this.scene.onBeforeRenderObservable.add(() => this.updateScene())
  }

  private readonly onCanvasClick = (event: MouseEvent): void => {
    this.pickAtClient(event.clientX, event.clientY)
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
          : this.visualByMeshId.has(mesh.uniqueId) ? 'planet'
            : this.starByMeshId.has(mesh.uniqueId) ? 'star' : 'other'
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
    const star = this.starByMeshId.get(mesh.uniqueId)
    if (star) this.focusStar(star)
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
    mesh.parent = this.universeRoot
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
        'uCraterDensity',
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
    material.setFloat('uCraterDensity', descriptor.craterCount / 48)
    mesh.material = material
    const visual = Object.freeze({ datum, descriptor, mesh, material })
    this.visualByQuestion.set(datum.question.id, visual)
    this.visualByMeshId.set(mesh.uniqueId, visual)
    this.updatePlanetPosition(visual, 0)
  }

  private updateScene(): void {
    if (this.destroyed) return
    const deltaTime = Math.min(50, Math.max(0, this.engine.getDeltaTime()))
    this.elapsedMs += this.reducedMotion ? 0 : deltaTime
    for (const visual of this.visualByQuestion.values()) {
      this.updatePlanetPosition(visual, this.elapsedMs)
      visual.material.setFloat('uTime', this.elapsedMs)
    }
    if (this.selectedVisual && this.universeVisible) {
      this.camera.target.copyFrom(this.selectedVisual.mesh.position)
      this.updateAnchor(this.selectedVisual.mesh)
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
    const firstStarMeshId = this.starByMeshId.keys().next().value as number | undefined
    const firstStarMesh = firstStarMeshId === undefined
      ? null
      : this.scene.meshes.find(({ uniqueId }) => uniqueId === firstStarMeshId) ?? null
    const firstStar = firstStarMesh ? this.projectToCss(firstStarMesh.getAbsolutePosition()) : null
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
    const viewport = this.camera.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight())
    const projected = Vector3.Project(point, Matrix.Identity(), this.scene.getTransformMatrix(), viewport)
    const rect = this.canvas.getBoundingClientRect()
    return {
      x: projected.x * rect.width / Math.max(1, this.engine.getRenderWidth()),
      y: projected.y * rect.height / Math.max(1, this.engine.getRenderHeight()),
      z: projected.z,
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
