import { Engine } from '@babylonjs/core/Engines/engine.js'
import '@babylonjs/core/Culling/ray.js'
import { Scene } from '@babylonjs/core/scene.js'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color.js'
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Viewport } from '@babylonjs/core/Maths/math.viewport.js'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight.js'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js'
import { PointLight } from '@babylonjs/core/Lights/pointLight.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder.js'
import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder.js'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh.js'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { ColorCurves } from '@babylonjs/core/Materials/colorCurves.js'
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration.js'
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js'
import { selectPlanetData, type UniverseIndex } from '../../domain/universe'
import type { Mode, Star, Universe } from '../../types'
import { buildMaterialTimeline, planetMaterialInput, planetWorldRadius } from '../gl/planetMaterials'
import { backdropGain } from '../backdropVisibility'
import {
  INITIAL_ORBIT_CLOCK, orbitClockTime, orbitTempoFor, planetSpinAngle, retimeOrbitClock,
  type OrbitClockState,
} from './planetMotion'
import { PlanetSky, thermalGroundAlbedo } from './planetSky'
import { PlanetGround } from './planetGround'
import { PlanetSurfaceMarks } from './planetSurfaceMarks'
import { PlanetSurfaceBeacons } from './planetSurfaceBeacons'
import { surfaceBeaconsFor } from './surfaceBeacons'
import { PlanetSurfaceTrail } from './planetSurfaceTrail'
import {
  advanceDescent, descentEase, descentProgress, IDLE_DESCENT_CLOCK, type DescentClock,
} from './surfaceDescent'
import { layoutSurfaceTrail } from './surfaceTrail'
import { formatTraceMonth } from '../../domain/questionProvenance'
import type { SurfaceLabel } from './labelLayer'
import { layoutSurfaceMarks, surfaceMarksFor } from './surfaceMarks'
import { PlanetSurfaceWorld } from './planetSurfaceWorld'
import { createPlanetTerrainSource } from './planetTerrainSource'
import {
  advanceSurfaceStage, IDLE_SURFACE_STAGE, surfaceCameraOwned, surfaceSkyVisible, surfaceWalkEnabled,
  surfaceWorldVisible, type SurfaceStageState,
} from './surfaceStage'
import { landingSite, standAt, surfaceFrame, surfaceNearPlane, walkSurface, type SurfacePose } from './surfaceCamera'
import { clusterRingOpacity } from '../clusterRingVisibility'
import { forcedE2EQuality, installE2EDiagnostics, recordE2EFrame, removeE2EDiagnostics, type RenderSnapshot, type StellarDiagnosticsSnapshot } from '../e2eDiagnostics'
import { starData, starWorldPosition, type StarDatum } from '../gl/starData'
import { starIdentity } from '../starIdentity'
import { renderDim, resolveInteractiveStar, starInteractionEligible } from '../starVisibility'
import { NON_FOCUSED_OPACITY } from '../focusEmphasis'
import { orbitPeriodFor, orbitPlane, systemOrbit } from '../orbitGeometry'
import { detectQuality, type Quality } from '../quality'
import type { PlanetDatum } from '../gl/bodies'
import type {
  InspectionPose,
  MindverseRenderer,
  ProbePart,
  RendererCallbacks,
  StrataMoveIntent,
  StrataRequest,
  StrataToken,
  SurfacePick,
  PlanetSurfaceEntry,
} from '../rendererContract'
import { BabylonRuntime, BabylonWebGL2RequiredError } from './runtime'
import {
  babylonBloomPolicy,
  babylonCinematicEnvironment,
  cappedDevicePixelRatio,
  type BabylonScenePhase,
} from './cinematic'
import { STAR_SURFACE_HDR_GAIN } from './stellarRadiance'
import { STANDARD_INSPECTION_POSE, normalizeInspectionPose } from '../probeInspection'
import { PROBE_APPROACH_MS, approachMix, probeInspectionCamera } from './probeCamera'
import { NebulaLayer } from './nebulaLayer'
import {
  PLANET_NEAR,
  THREE_VERTICAL_FOV,
  panoramaDistance,
  planetFocusDistance,
  sceneRadiusOf,
  systemDistance,
  wheelExitThreshold,
  arcRotateFromYawPitch,
  THREE_PANORAMA_PITCH,
  THREE_PANORAMA_YAW,
  wheelRadiusBounds,
  type FramingPhase,
} from './framing'
import { DustLayer } from './dustLayer'
import { StarfieldLayer } from './starfieldLayer'
import {
  strataDepthFog, strataGuideLight, strataSpecimenHalo,
} from './strataAtmosphere'
import { babylonUpliftTier } from './visualUplift'
import { babylonCinematicGrade, spaceFogWindow } from './cinematicGrade'
import { cameraDamping } from './interactionFeedback'
import { nebulaPaletteRgb } from '../nebulaPalette'
import { CLUSTER_RING_GAIN, ClusterRingLayer } from './clusterRingLayer'
import { OverlayLayer } from './overlayLayer'
import { LabelLayer } from './labelLayer'
import { LabelStrategyCache } from '../labelVisibility'
import { ProbeLayer } from './probeLayer'
import {
  CAVE_LIGHT_INTENSITY,
  CAVE_LIGHT_RANGE,
  laminationSubdivisions,
  SEAM_EMISSIVE,
  SEAM_THICKNESS,
  layerBaseColor,
  layerEmissive,
} from './strataPalette'
import { paintLaminations } from './strataLaminations'
import { buildPlanetSurfaceDescriptor, type PlanetSurfaceDescriptor } from './planetSurface'
import { projectedSphereDiameterPixels } from './planetLod'
import { PlanetVisual } from './PlanetVisual'
import { PlanetFocusController } from './PlanetFocusController'
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
  questionOrbitAlpha,
  questionPlanetPresentation,
  StellarPointerPresentationController,
  type OrbitPresentationState,
} from './orbitPresentation'
import { StarLayer } from './starLayer'
import { describeStarPresentation, HOVER_INTERPOLATION_MS, type StarPresentation } from './starPresentation'
import {
  ProjectedStarCandidateBuffer, pickProjectedStar,
  type PointerInputKind, type ProjectedStarCandidate,
} from './starPicker'
import { CameraFlightController, computeSystemExtent, exitTarget, shouldExitOnWheel, type CameraFlight } from './cameraFlight'
import { describeStarVisual } from './starVisualDescriptor'

const ORBIT_BASE = 2.1
/** Kept as a named export for the render gates; the tier table owns the value. */
export const BABYLON_BLOOM_THRESHOLD = babylonCinematicEnvironment('high').bloomThreshold
/** Babylon 的加法混合模式常量（Constants.ALPHA_ADD），避免为一个数拉进整个 Constants。 */
const ALPHA_ADD_MODE = 1
/** Three PROBE_SCAN_MS：扫描扫掠的时长。 */
const PROBE_SCAN_MS = 900
const activeBabylonRenderers = new Set<BabylonRenderer>()

interface PlanetImageProcessingConfiguration {
  toneMappingEnabled: boolean
  toneMappingType: number
  ditheringEnabled: boolean
  exposure: number
}

/**
 * 镜头层：暗角、颜色分级、颗粒、色差。
 *
 * 全部叠在恢复批次的 bloom / tone mapping 之上，**不改动它们的任何一个数** ——
 * 分级是一层镜头，不是对已恢复画质的重新定义。
 */
function applyCinematicLens(pipeline: DefaultRenderingPipeline, quality: Quality): void {
  const grade = babylonCinematicGrade(quality)
  pipeline.imageProcessingEnabled = true
  const processing = pipeline.imageProcessing
  if (!processing) return
  processing.vignetteEnabled = true
  processing.vignetteWeight = grade.vignetteWeight
  processing.vignetteColor = new Color4(
    grade.vignetteColor[0], grade.vignetteColor[1], grade.vignetteColor[2], 0,
  )
  processing.vignetteBlendMode = ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY
  // 暗部偏冷、亮部偏暖：空气透视在颜色上的表达，冷退暖进。
  processing.colorCurvesEnabled = true
  const curves = new ColorCurves()
  curves.shadowsHue = 220
  curves.shadowsDensity = grade.shadowsCoolness
  curves.highlightsHue = 34
  curves.highlightsDensity = grade.highlightsWarmth
  curves.globalSaturation = grade.globalSaturation
  processing.colorCurves = curves

  pipeline.grainEnabled = true
  pipeline.grain.intensity = grade.grainIntensity
  pipeline.grain.animated = true
  pipeline.chromaticAberrationEnabled = grade.chromaticAberration > 0
  if (grade.chromaticAberration > 0) {
    pipeline.chromaticAberration.aberrationAmount = grade.chromaticAberration
  }
}

export function configurePlanetImageProcessing(configuration: PlanetImageProcessingConfiguration): void {
  configuration.toneMappingEnabled = true
  configuration.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL
  configuration.ditheringEnabled = true
  configuration.exposure = 0.92
}

export { babylonBloomPolicy, cappedDevicePixelRatio } from './cinematic'

export function materializedPlanetsForStar(
  planets: readonly PlanetDatum[],
  star: StarDatum | null,
): readonly PlanetDatum[] {
  return star ? planets.filter((planet) => planet.star === star) : []
}

export function shouldUpdateMaterializedPlanet(universeVisible: boolean, meshEnabled: boolean): boolean {
  return universeVisible && meshEnabled
}

/**
 * 相机飞行按**墙钟**推进，而不是累加被 50ms 封顶的帧间隔。
 *
 * 那个封顶是给动画用的（防止隐藏标签页回来时场景瞬移），但飞行是一段
 * 固定时长的转场：在软件光栅器上一帧要几百毫秒，累加封顶值会让它永远
 * 停在 0.9 附近，UI 就一直卡在「接近中」。
 *
 * @param startedAt 飞行起始时刻；非有限时退回整段时长（立即完成）。
 */
export function flightElapsedMs(
  startedAt: number,
  now: number,
  durationMs: number,
  previousElapsedMs: number,
): number {
  if (!Number.isFinite(startedAt) || !Number.isFinite(now)) return durationMs
  const wall = Math.max(0, now - startedAt)
  const previous = Number.isFinite(previousElapsedMs) ? Math.max(0, previousElapsedMs) : 0
  // Never skip more than an eighth of the transition in one frame: on a software
  // rasteriser a single 500 ms frame would otherwise jump straight to the end
  // and the approach reveal would never be drawn.
  const ceiling = previous + Math.max(1, durationMs / 8)
  return Math.min(durationMs, Math.min(wall, ceiling))
}

export function elapsedRenderDelta(previousNow: number | null, now: number): number {
  if (previousNow === null || !Number.isFinite(previousNow) || !Number.isFinite(now) || now < previousNow) return 0
  return Math.min(50, Math.max(0, now - previousNow))
}

function mobileDevice(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
}

interface PlanetVisualRecord {
  readonly datum: PlanetDatum
  readonly descriptor: PlanetSurfaceDescriptor
  readonly visual: PlanetVisual
  readonly orbit: LinesMesh
}

/** 轨道俯冲到站立的时长。与大气层穿越同量级，让落地有过程感。 */
const SURFACE_DESCENT_MS = 1100
/** 宇宙视角的近裁剪面。地表阶段按眼高另算，退场时还原。 */
const UNIVERSE_CAMERA_MIN_Z = 0.1
/** 宇宙视角的最近机位。地表阶段相机贴着地面，这个下限必须让开。 */
const UNIVERSE_LOWER_RADIUS_LIMIT = 1.2
/** 旗与石堆的屏幕空间命中半径与上抬量（像素）。 */
const SURFACE_MARK_PICK_RADIUS_PX = 22
const SURFACE_MARK_PICK_LIFT_PX = 8
const SURFACE_BEACON_PICK_RADIUS_PX = 26
/** 绕行星转动时俯仰离极点留的余量，避免上向量翻面。 */
const PLANET_ORBIT_BETA_MARGIN = 0.08

export class BabylonRenderer implements MindverseRenderer {
  private readonly runtime: BabylonRuntime
  private readonly callbacks: RendererCallbacks
  private readonly canvas: HTMLCanvasElement
  private readonly labelCanvas: HTMLCanvasElement
  private readonly engine: Engine
  private readonly scene: Scene
  private pipeline!: DefaultRenderingPipeline
  private readonly camera: ArcRotateCamera
  private readonly universeRoot: TransformNode
  private readonly universe: Universe
  private readonly stars: readonly StarDatum[]
  private readonly starLayer: StarLayer
  private readonly candidateBuffer: ProjectedStarCandidateBuffer
  private readonly quality: Quality
  private readonly pointerPresentation = new StellarPointerPresentationController()
  private readonly cameraFlightController = new CameraFlightController()
  private readonly planetFocusController: PlanetFocusController
  private caveRoot: TransformNode | null = null
  private caveGuideLight: PointLight | null = null
  private caveMaxDepth = 1
  private nebula: NebulaLayer | null = null
  private starfield: StarfieldLayer | null = null
  private dust: DustLayer | null = null
  private rings: ClusterRingLayer | null = null
  private overlay: OverlayLayer | null = null
  private labels: LabelLayer | null = null
  private probeLayer: ProbeLayer | null = null
  private inspectedProbeId: string | null = null
  private arrivedProbeId: string | null = null
  private probeInspectionPose: InspectionPose = { ...STANDARD_INSPECTION_POSE }
  private probeScanTimer: ReturnType<typeof setTimeout> | null = null
  private probeApproach: { readonly probeId: string; readonly token: number; readonly startedAt: number } | null = null
  private probeCameraMix = 0
  private readonly labelStrategy: LabelStrategyCache
  private sceneRadius = 60
  private readonly planets: readonly PlanetDatum[]
  private readonly visualByQuestion = new Map<string, PlanetVisualRecord>()
  private readonly visualByMeshId = new Map<number, PlanetVisualRecord>()
  private materializedOwnerKey: string | null = null
  private readonly specimenByMeshId = new Map<number, CaveSpecimenPlacement>()
  private readonly probes: ReadonlySet<string>
  private readonly strataTransition: StrataTransitionController
  private selected: PlanetDatum | null = null
  private selectedVisual: PlanetVisualRecord | null = null
  private focusedStar: StarDatum | null = null
  private mode: Mode = 'all'
  private wormIdx = 0
  private readonly interactionByDatum = new Map<StarDatum, boolean>()
  private hoverKey: string | null = null
  private pressedKey: string | null = null
  private hoverProgress = 0
  private pressedProgress = 0
  private activeFlight: Readonly<{ flight: CameraFlight; elapsedMs: number; startedAt: number }> | null = null
  /** 最近一次接近飞行的计划时长，飞行结束后仍保留，供 E2E 判定减弱动效是否真的跳过了长飞行。 */
  private lastFlightDurationMs = 0
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
  private lastSceneUpdateAt: number | null = null
  private lastStrataMoveAt: number | null = null
  private overviewTarget = Vector3.Zero()
  private overviewRadius = 30
  private entryCameraSnapshot: Readonly<{ alpha: number; beta: number; radius: number; target: Vector3 }> | null = null
  private destroyed = false
  private universeVisible = true
  /** 公转时钟：全景全速、恒星系慢速、选中行星时停住，换节奏不跳。 */
  private orbitClock: OrbitClockState = INITIAL_ORBIT_CLOCK
  // ── 可环绕地表 ──
  private surfaceStage: SurfaceStageState = IDLE_SURFACE_STAGE
  private surfaceWorld: PlanetSurfaceWorld | null = null
  private surfaceSky: PlanetSky | null = null
  /** 地表材质控制器：太阳、相机与热型调色。材质本身归 surfaceWorld 释放。 */
  private surfaceGround: PlanetGround | null = null
  /** 落点旁你留下的痕迹：创作是旗、收藏是石堆。 */
  private surfaceMarks: PlanetSurfaceMarks | null = null
  /** 天上的邻居：同恒星系的问题、虫洞通向的星群。 */
  private surfaceBeacons: PlanetSurfaceBeacons | null = null
  /** 指向下一站的小径与路牌。 */
  private surfaceTrail: PlanetSurfaceTrail | null = null
  private surfaceSignpost: { questionId: string; starId: string; text: string } | null = null
  private diagnosticSurfacePickCalls = 0
  private diagnosticOrbitCalls = 0
  /** 相机指针控制当前是否挂着。构造时 attachControl 过一次。 */
  private cameraControlAttached = true
  /** 地表的太阳与天光。地形块用 StandardMaterial，场景里没有灯它就是一片黑。 */
  private surfaceSun: DirectionalLight | null = null
  private surfaceAmbient: HemisphericLight | null = null
  private surfaceRoot: TransformNode | null = null
  private surfacePose: SurfacePose | null = null
  /** 地表世界的行星基准半径（世界单位）。 */
  private surfaceRadius = 1
  private surfaceDisplacement = 0
  private surfaceField: import('./terrainField').PlanetTerrainField | null = null
  /** 俯冲的起点机位与起飞时刻。落地后不再使用。 */
  private surfaceDescent: Readonly<{ from: Vector3; fromTarget: Vector3 }> | null = null
  /** 俯冲时钟：等地表建够才起步，按帧推进。 */
  private descentClock: DescentClock = IDLE_DESCENT_CLOCK
  /** 上一帧的真实间隔，俯冲按它推进（墙钟会把卡顿算进动画）。 */
  private lastFrameDeltaMs = 16
  /** 上一帧的宇宙背景增益。地表阶段必须是 0 —— 这是「没有宇宙视角」的判据。 */
  private backdropGainValue = 1
  private workspaceOpen = false
  private reducedMotion: boolean
  private planetExitPending = false
  private planetDragPointerId: number | null = null
  private planetDragX = 0
  private planetDragY = 0
  private planetDragMovement = 0
  private planetDragStartedOnTarget = false
  private diagnosticClickEvents = 0
  private diagnosticLastPick: NonNullable<RenderSnapshot['lifecycle']['lastPick']> = 'none'
  private readonly diagnosticCameraSamples: StellarDiagnosticsSnapshot['cameraSamples'] = []
  private diagnosticCameraSequence = 0
  private diagnosticApproachProgressOverride: number | null = null
  private diagnosticPlanetVisualConstructions = 0
  private diagnosticPlanetShaderCompileRequests = 0
  private diagnosticPlanetUpdatesLastFrame = 0
  private readonly labelPointScratch = new Vector3()
  private readonly starPositionScratch = new Vector3()
  private readonly flightTargetScratch = new Vector3()
  private readonly planetStarPositionScratch = new Vector3()
  private readonly planetPositionScratch = new Vector3()
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
    const forcedQuality = import.meta.env.VITE_E2E_DIAGNOSTICS === '1'
      ? forcedE2EQuality(location.search)
      : null
    this.quality = forcedQuality ?? detectQuality(reducedMotion)
    // Backing-store resolution is a quality-tier decision, so it has to be
    // resolved before the engine is sized rather than clamped for everyone.
    engine.setHardwareScalingLevel(
      1 / cappedDevicePixelRatio(window.devicePixelRatio, mobileDevice(), this.quality),
    )
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
      // 旧版的开场机位（yaw 0.5 / pitch -0.2）。批次 4 曾因为「恒星挤到相机与
      // 行星之间」放弃过它 —— 那其实是两个 bug 的症状：行星世界半径大了近一倍，
      // 以及聚焦辉光没有 Three 的投影上限。两处修好之后，这个机位让
      // planet-focus 的覆盖率与各亮度层全部回到容差内。
      const opening = arcRotateFromYawPitch(THREE_PANORAMA_YAW, THREE_PANORAMA_PITCH)
      const camera = new ArcRotateCamera('mindverse-camera', opening.alpha, opening.beta, 30, Vector3.Zero(), scene)
      this.camera = camera
      camera.fov = THREE_VERTICAL_FOV
      camera.minZ = UNIVERSE_CAMERA_MIN_Z
      camera.lowerRadiusLimit = UNIVERSE_LOWER_RADIUS_LIMIT
      camera.upperRadiusLimit = 10_000
      // 相机阻尼显式化，并与 Reduced Motion 联动：「到位之后还在漂」
      // 正是降级动效偏好要消除的那一类运动。滚轮步长恒定 —— 退出阶梯
      // 的三个阈值是按它标定的。
      const damping = cameraDamping(reducedMotion)
      camera.inertia = damping.inertia
      camera.panningInertia = damping.panningInertia
      camera.angularSensibilityX = damping.angularSensibility
      camera.angularSensibilityY = damping.angularSensibility
      camera.wheelDeltaPercentage = damping.wheelDeltaPercentage
      camera.pinchDeltaPercentage = damping.wheelDeltaPercentage
      camera.attachControl(canvas, true)
      scene.activeCamera = camera
      this.planetFocusController = new PlanetFocusController({
        readPose: () => ({
          target: { x: camera.target.x, y: camera.target.y, z: camera.target.z },
          radius: camera.radius,
        }),
        writePose: (pose) => {
          camera.setTarget(new Vector3(pose.target.x, pose.target.y, pose.target.z))
          camera.radius = pose.radius
        },
        orbit: (yawDelta, pitchDelta) => {
          this.diagnosticOrbitCalls += 1
          if (!Number.isFinite(yawDelta) || !Number.isFinite(pitchDelta)) return
          camera.alpha += yawDelta
          // 夹住俯仰：贴到极点时 ArcRotateCamera 的上向量会翻面，画面猛地一跳。
          camera.beta = Math.min(Math.PI - PLANET_ORBIT_BETA_MARGIN,
            Math.max(PLANET_ORBIT_BETA_MARGIN, camera.beta + pitchDelta))
        },
        stopInertia: () => {
          camera.inertialAlphaOffset = 0
          camera.inertialBetaOffset = 0
          camera.inertialRadiusOffset = 0
          camera.inertialPanningX = 0
          camera.inertialPanningY = 0
        },
      }, () => { this.planetExitPending = true }, { reducedMotion })
      this.labelStrategy = new LabelStrategyCache(index.universe.clusters ?? [], this.stars)
      this.starLayer = new StarLayer(scene, this.stars, this.quality, reducedMotion, {
        parent: this.universeRoot,
        onError: callbacks.onRenderError,
        hdrGain: STAR_SURFACE_HDR_GAIN,
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
        isPageHidden: () => document.hidden,
      }, {
        onReady: callbacks.onRenderReady,
        onError: callbacks.onRenderError,
        isAnimating: () => this.hasActiveAnimation(),
      })
      this.runtime = runtime
      this.labels = new LabelLayer(labelCanvas)
      this.resizeLabels()
      if (import.meta.env.VITE_E2E_DIAGNOSTICS === '1') {
        installE2EDiagnostics(
          this,
          this.quality,
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
                surfaceMarks: this.surfaceMarkProjections(),
                surfaceBeacons: this.surfaceBeaconProjections().map(({ kind, label, x, y }) => ({ kind, label, x, y })),
                surfaceSignpost: this.surfaceSignpostProjection(),
              }
            },
            lifecycle: () => {
              const runtime = this.runtime.diagnostics()
              return {
                rafLoops: runtime.renderLoops,
                listeners: runtime.listeners + (this.destroyed ? 0 : 8),
                clickEvents: this.diagnosticClickEvents,
                lastPick: this.diagnosticLastPick,
                surfacePickCalls: this.diagnosticSurfacePickCalls,
                orbitCalls: this.diagnosticOrbitCalls,
                focusState: this.planetFocusController.state,
              }
            },
            stellar: () => this.diagnosticStellar(),
            planet: () => {
              const diagnostics = this.selectedVisual?.visual.diagnostics()
              return {
                selectedQuestionId: this.selected?.question.id ?? null,
                surfaceLevel: diagnostics?.surfaceLevel ?? null,
                surfaceFallback: diagnostics?.surfaceFallback ?? false,
                atmosphereFallback: diagnostics?.atmosphereFallback ?? false,
                rotation: diagnostics?.rotation ?? null,
                thermalDominant: diagnostics?.thermalDominant ?? null,
                highFrequencyDetail: diagnostics?.highFrequencyDetail ?? false,
                visible: [...this.visualByQuestion.values()].flatMap(({ datum, visual }) => {
                  if (!visual.activeMesh.isEnabled()) return []
                  const details = visual.diagnostics()
                  return [{
                    questionId: datum.question.id,
                    surfaceLevel: details.surfaceLevel,
                    thermalDominant: details.thermalDominant,
                    highFrequencyDetail: details.highFrequencyDetail,
                    bounds: this.planetBounds(visual.activeMesh, visual.radius),
                  }]
                }),
              }
            },
            resources: () => ({
              highPlanetCount: [...this.visualByQuestion.values()]
                .filter(({ visual }) => visual.focusMesh?.isEnabled()).length,
              materializedPlanetCount: this.visualByQuestion.size,
              planetVisualConstructions: this.diagnosticPlanetVisualConstructions,
              planetShaderCompileRequests: this.diagnosticPlanetShaderCompileRequests,
              planetUpdatesLastFrame: this.diagnosticPlanetUpdatesLastFrame,
              actualRenderCount: this.runtime.diagnostics().actualRenders,
              nebulaShellCount: this.nebula?.diagnostics().shellCount ?? 0,
              clusterRingCount: this.rings?.diagnostics().ringCount ?? 0,
              clusterRingGain: this.rings?.diagnostics().gain ?? 0,
              wormholePointCount: this.overlay?.diagnostics().wormholePointCount ?? 0,
              darkLensCount: this.overlay?.diagnostics().darkLensCount ?? 0,
              dustCount: this.dust?.diagnostics().dustCount ?? 0,
              soloCount: this.dust?.diagnostics().soloCount ?? 0,
              starfieldPointCount: this.starfield?.diagnostics().pointCount ?? 0,
              starfieldShellCount: this.starfield?.diagnostics().batchCount ?? 0,
              backdropGain: this.backdropGainValue,
              surfaceStage: this.surfaceStageDiagnostics(),
              renderCostMs: this.runtime.diagnostics().lastRenderCostMs,
              maxRenderCostMs: this.runtime.diagnostics().maxRenderCostMs,
            }),
            setApproachProgress: (progress) => this.setDiagnosticApproachProgress(progress),
            preparePlanetCapture: () => this.prepareDiagnosticPlanetCapture(),
            flipFarPlanetCapture: () => this.flipDiagnosticFarPlanetCapture(),
            resetRenderCostPeak: () => {
              if (this.destroyed) return false
              this.runtime.resetRenderCostPeak()
              return true
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
    this.diagnosticApproachProgressOverride = null
    this.destroyed = true
    activeBabylonRenderers.delete(this)
    this.selected = null
    this.selectedVisual = null
    this.cancelFlight('destroy')
    this.clearPointerFeedback()
    this.strataTransition.destroy()
    this.removePointerListeners()
    this.releaseMaterializedPlanets()
    this.nebula?.dispose()
    this.nebula = null
    this.starfield?.dispose()
    this.starfield = null
    this.dust?.dispose()
    this.dust = null
    this.disposeSurfaceWorld()
    this.rings?.dispose()
    this.rings = null
    this.overlay?.dispose()
    this.overlay = null
    this.labels?.dispose()
    this.labels = null
    this.cancelProbeScan()
    this.probeLayer?.dispose()
    this.probeLayer = null
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
    this.releaseMaterializedPlanets()
    this.starLayer.setFocus(null, null)
    this.applyLayerFocus(null)
    this.camera.setTarget(this.overviewTarget)
    this.camera.radius = this.overviewRadius
    this.syncOrbitPresentation()
  }

  clearPlanet(): void {
    // 取消选中行星就是离开它的地表；否则宇宙一直关着、相机一直被地表占着。
    this.exitPlanetSurface()
    this.syncCameraControl()
    if (this.destroyed || !this.selected) return
    this.planetFocusController.suspend()
    this.selectedVisual?.visual.setSelected(false)
    this.selectedVisual?.visual.setLod(this.quality === 'low' ? 'low' : 'medium')
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
    this.selectedVisual?.visual.setSelected(false)
    this.materializeStarSystem(planet.star)
    this.selected = planet
    this.selectedVisual = this.visualByQuestion.get(planet.question.id) ?? null
    this.focusedStar = planet.star
    this.starLayer.setFocus(starIdentity(planet.star.s), planet.star)
    this.selectedVisual?.visual.setSelected(true)
    if (this.selectedVisual) {
      const framing = this.planetFraming(planet)
      this.planetFocusController.enter(
        this.selectedVisual.visual, framing.distance, { low: framing.low, high: framing.high },
      )
    }
    this.syncCameraControl()
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
    this.syncCameraControl()
    this.applyCameraViewport()
    // Three pulls in to PLANET_NEAR so the planet stays readable beside the panel.
    if (open && this.selected && !surfaceCameraOwned(this.surfaceStage)) this.camera.radius = PLANET_NEAR
    if (open) this.clearPointerFeedback()
  }

  /**
   * 工作台打开时把 3D 视口让给右侧面板；站在地表上时视口占满 —— 那是主画面，
   * 面板只是叠在上面的 HUD。
   */
  /**
   * 相机的指针控制归谁。
   *
   * 聚焦一颗行星时，环绕由 PlanetFocusController 驱动（它同时管半径夹取、惯性、键盘）；
   * 此时若还留着 ArcRotateCamera 自带的指针环绕，一次拖动会被转两遍 —— 实测拖 320px
   * 相机绕了 4.6 弧度（265°），恒星甩满半屏、选中的行星直接飞出画面。站在地表上同理。
   */
  private syncCameraControl(): void {
    const owned = this.planetFocusController.state !== 'idle' || surfaceCameraOwned(this.surfaceStage)
    const attach = this.universeVisible && !this.workspaceOpen && !owned
    // 幂等：稳态下是空操作，所以可以每帧调。聚焦的进入/退出是一段过渡，状态在几帧之后
    // 才落到 idle —— 只在离散时刻同步就会把控制权永远关着（实测退回恒星后滚轮失灵，
    // 相机半径卡在 16 不动，再也退不回全景）。
    if (attach === this.cameraControlAttached) return
    this.cameraControlAttached = attach
    if (attach) this.camera.attachControl(this.canvas, true)
    else this.camera.detachControl()
  }

  private applyCameraViewport(): void {
    const open = this.workspaceOpen && !surfaceCameraOwned(this.surfaceStage)
    this.camera.viewport = open && this.engine.getRenderWidth() > 760
      ? new Viewport(0.18, 0, 0.82, 1)
      : open ? new Viewport(0, 0.16, 1, 0.84) : new Viewport(0, 0, 1, 1)
  }

  orbitWorkspace(deltaX: number, deltaY: number): void {
    if (this.destroyed || !this.selected) return
    // 站在地表上时拖动是环视，不是转行星。
    if (surfaceCameraOwned(this.surfaceStage)) {
      this.walkPlanetSurface({ forward: 0, strafe: 0, turn: deltaX * 0.004, tilt: -deltaY * 0.004 })
      return
    }
    if (!this.planetFocusController.drag(deltaX, deltaY)) {
      this.selectedVisual?.visual.rotate(-deltaX * 0.005, -deltaY * 0.005)
    }
  }

  /** 飞到探测器旁：先聚焦它的恒星，再用一段接近把镜头交给检查视角。 */
  approachProbe(probeId: string, token: number): void {
    if (this.destroyed) return
    this.cancelProbeScan()
    this.probeApproach = null
    this.arrivedProbeId = null
    try {
      if (!this.probes.has(probeId)) throw unsupported(`未知探测器：${probeId}`)
      if (!this.probeLayer?.hasProbe(probeId)) throw unsupported(`探测器未在轨：${probeId}`)
      const owner = this.probeOwner(probeId)
      if (!owner) throw unsupported(`探测器没有归属恒星：${probeId}`)
      this.clearPlanet()
      if (this.focusedStar !== owner && !this.applyStarFocus(owner)) {
        throw unsupported(`无法聚焦探测器所属恒星：${probeId}`)
      }
      this.inspectedProbeId = probeId
      this.probeInspectionPose = { ...STANDARD_INSPECTION_POSE }
      this.probeLayer.inspect(probeId)
      this.probeLayer.setScanning(false)
      if (this.reducedMotion) {
        this.probeCameraMix = 1
        this.arrivedProbeId = probeId
        this.callbacks.onProbeArrived?.({ probeId, token })
      } else {
        // 接近由帧循环按墙钟推进 —— 与相机飞行同一套理由：慢硬件上按帧间隔
        // 累加会把接近饿死在 0.9 上，UI 永远停在「接近中」。
        this.probeCameraMix = 0
        this.probeApproach = Object.freeze({ probeId, token, startedAt: performance.now() })
        this.activeFlight = null
      }
    } catch (cause) {
      this.exitProbeInspection()
      this.callbacks.onProbeError?.({
        probeId, token, cause: cause instanceof Error ? cause : new Error(String(cause)),
      })
    }
  }

  private probeOwner(probeId: string): StarDatum | null {
    const focusedId = this.focusedStar && 'id' in this.focusedStar.s ? this.focusedStar.s.id : null
    let fallback: StarDatum | null = null
    for (const datum of this.stars) {
      const star = datum.s as { id?: string; probeIds?: readonly string[] }
      if (!star.probeIds?.includes(probeId)) continue
      if (star.id === focusedId) return datum
      fallback ??= datum
    }
    return fallback
  }

  startProbeScan(probeId: string, token: number): void {
    if (this.destroyed) return
    if (this.arrivedProbeId !== probeId || this.inspectedProbeId !== probeId) {
      this.callbacks.onProbeError?.({ probeId, token, cause: unsupported(`探测器检查尚未就绪：${probeId}`) })
      return
    }
    this.cancelProbeScan()
    this.probeCameraMix = 1
    this.probeLayer?.setScanning(true)
    const complete = () => {
      this.probeScanTimer = null
      this.probeLayer?.setScanning(false)
      this.callbacks.onProbeScanComplete?.({ probeId, token })
    }
    if (this.reducedMotion) complete()
    else this.probeScanTimer = setTimeout(complete, PROBE_SCAN_MS)
  }

  /** 主动旋转观察：相机绕着机体转，与旧版一致（机体自转会让平移失去参照）。 */
  setProbeInspectionPose(pose: InspectionPose): void {
    if (this.destroyed) return
    this.probeInspectionPose = normalizeInspectionPose(pose)
  }

  focusProbePart(part: ProbePart | null): void {
    if (this.destroyed) return
    this.probeLayer?.setPartHighlight(part)
  }

  exitProbeInspection(): void {
    if (this.destroyed) return
    const hadProbeState = this.probeApproach !== null
      || this.inspectedProbeId !== null
      || this.arrivedProbeId !== null
    this.cancelProbeScan()
    this.probeApproach = null
    this.probeLayer?.setScanning(false)
    this.probeLayer?.setPartHighlight(null)
    this.probeLayer?.inspect(null)
    this.inspectedProbeId = null
    this.arrivedProbeId = null
    this.probeInspectionPose = { ...STANDARD_INSPECTION_POSE }
    this.probeCameraMix = 0
    // 退出后镜头回到刚才那颗恒星，而不是停在机体旁边。
    if (hadProbeState && this.focusedStar && this.universeVisible) {
      this.camera.setTarget(this.currentStarPosition(this.focusedStar))
    }
  }

  /**
   * 每帧把镜头拉向检查机位。
   *
   * 与 Renderer.ts::applyProbeInspectionCamera 同式：位置向目标机位插值、
   * 注视点从恒星插值到机体，于是「接近」是一段真实的运镜而不是一次瞬移。
   */
  private applyProbeInspectionCamera(): void {
    const probeId = this.inspectedProbeId
    if (!probeId || !this.probeLayer) return
    const approach = this.probeApproach
    if (approach) {
      this.probeCameraMix = approachMix(performance.now() - approach.startedAt, PROBE_APPROACH_MS)
      if (this.probeCameraMix >= 1) {
        this.probeApproach = null
        this.arrivedProbeId = approach.probeId
        this.callbacks.onProbeArrived?.({ probeId: approach.probeId, token: approach.token })
      }
    }
    if (this.probeCameraMix <= 0) return
    if (!this.probeLayer.inspectionTarget(this.probeTargetScratch)) return
    const probe = this.probeTargetScratch
    const { position, lookAt } = probeInspectionCamera(
      [probe.x, probe.y, probe.z],
      this.probeInspectionPose,
    )
    const wanted = new Vector3(position[0], position[1], position[2])
    const focus = this.camera.target.clone()
    const nextPosition = Vector3.Lerp(this.camera.globalPosition, wanted, this.probeCameraMix)
    const nextTarget = Vector3.Lerp(focus, new Vector3(lookAt[0], lookAt[1], lookAt[2]), this.probeCameraMix)
    if (!finiteVector3(nextPosition) || !finiteVector3(nextTarget)) return
    this.camera.setTarget(nextTarget)
    this.camera.setPosition(nextPosition)
  }

  private readonly probeTargetScratch = new Vector3()

  private cancelProbeScan(): void {
    if (this.probeScanTimer === null) return
    clearTimeout(this.probeScanTimer)
    this.probeScanTimer = null
  }

  setReducedMotion(reduced: boolean): void {
    if (this.destroyed || this.reducedMotion === reduced) return
    this.reducedMotion = reduced
    this.planetFocusController.setReducedMotion(reduced)
    this.starLayer.setReducedMotion(reduced)
    this.starfield?.setReducedMotion(reduced)
    const damping = cameraDamping(reduced)
    this.camera.inertia = damping.inertia
    this.camera.panningInertia = damping.panningInertia
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
    }
    if (this.selectedVisual && this.universeVisible) {
      this.camera.target.copyFrom(this.selectedVisual.visual.activeMesh.position)
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
    // 往脚下挖：地表世界退场（洞穴有自己的墙），阶段进入 digging。
    this.surfaceStage = advanceSurfaceStage(this.surfaceStage, {
      kind: 'dig', token: this.surfaceStage.token,
    })
    this.applySurfaceVisibility()
    this.cancelFlight('strata')
    this.planetFocusController.suspend(false)
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
  exitStrata(token: StrataToken): void {
    // 升回地表要等上浮动画结束（setUniverseVisible(true) 那一刻）。此刻就把相机交还
    // 给地表，会和还在跑的上浮飞行同帧互写相机，最终机位取决于谁最后写 —— 负载下
    // 实测退回地表后 alpha 偏了 0.12。
    this.strataTransition.exit(token)
  }

  private createScene(index: UniverseIndex): void {
    configurePlanetImageProcessing(this.scene.imageProcessingConfiguration)
    const environment = babylonCinematicEnvironment(this.quality)
    const pipeline = new DefaultRenderingPipeline('mindverse-pipeline', true, this.scene, [this.camera])
    this.pipeline = pipeline
    pipeline.samples = environment.multisampling
    pipeline.fxaaEnabled = environment.fxaa
    pipeline.bloomEnabled = true
    pipeline.bloomThreshold = environment.bloomThreshold
    pipeline.bloomWeight = environment.bloomWeight
    pipeline.bloomScale = environment.bloomScale
    pipeline.bloomKernel = babylonBloomPolicy('panorama', this.quality).kernel
    applyCinematicLens(pipeline, this.quality)

    this.configureOverview(index.universe)
    // 背景层先建：它们决定画面的底，恒星与行星叠在上面。
    // 星场在最外层：它是「远」本身，星云与尘埃都叠在它前面。
    this.starfield = new StarfieldLayer(this.scene, {
      radius: this.sceneRadius,
      quality: this.quality,
      reducedMotion: this.reducedMotion,
      parent: this.universeRoot,
    })
    this.nebula = new NebulaLayer(this.scene, {
      radius: this.sceneRadius,
      palette: nebulaPaletteRgb(index.universe.clusters ?? []),
      environment,
      parent: this.universeRoot,
    })
    this.dust = new DustLayer(this.scene, index.universe, {
      environment,
      reducedMotion: this.reducedMotion,
      parent: this.universeRoot,
    })
    this.probeLayer = new ProbeLayer(this.scene, index, this.stars, {
      reducedMotion: this.reducedMotion, parent: this.universeRoot, quality: this.quality,
    })
    this.rings = new ClusterRingLayer(this.scene, index.universe, this.universeRoot)
    this.overlay = new OverlayLayer(this.scene, index.universe, {
      quality: this.quality, reducedMotion: this.reducedMotion, parent: this.universeRoot,
    })
    this.applyModeDimensions()
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

  /**
   * 全景取景。
   *
   * 注视点是**原点**、距离由 sceneRadius 导出，与 Three 同规则。旧实现用星群
   * 质心包围盒 × 2.4：单星宇宙里相机会停在十几个单位处，星云与核心盘糊满整屏。
   */
  private configureOverview(universe: Universe): void {
    this.sceneRadius = sceneRadiusOf(
      (universe.stars ?? []) as readonly { p: readonly [number, number, number] }[],
      (universe.clusters ?? []) as readonly { c: readonly [number, number, number] }[],
    )
    this.overviewTarget = Vector3.Zero()
    const distance = panoramaDistance(this.sceneRadius)
    this.overviewRadius = finitePositive(distance) ? distance : 97.2
    this.camera.setTarget(this.overviewTarget)
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
    const orbit = this.createQuestionOrbit(datum)
    const diagnosticParams = import.meta.env.VITE_E2E_DIAGNOSTICS === '1' ? new URLSearchParams(location.search) : null
    const surfaceFailure = diagnosticParams?.get('e2ePlanetSurfaceFail')
    const atmosphereFailure = diagnosticParams?.get('e2ePlanetAtmosphereFail') === '1'
    let record: PlanetVisualRecord
    const visual = new PlanetVisual({
      scene: this.scene,
      descriptor,
      parent: this.universeRoot,
      quality: this.quality,
      initialLod: this.quality === 'low' ? 'low' : 'medium',
      onMeshesChanged: () => this.refreshPlanetMeshIndex(record),
      compileSurface: async (material, level, mesh) => {
        this.diagnosticPlanetShaderCompileRequests += 1
        if (surfaceFailure === 'all' || surfaceFailure === level) throw new Error(`E2E injected ${level} planet surface failure`)
        await material.forceCompilationAsync(mesh)
      },
      compileAtmosphere: async (material, mesh) => {
        this.diagnosticPlanetShaderCompileRequests += 1
        if (atmosphereFailure) throw new Error('E2E injected planet atmosphere failure')
        await material.forceCompilationAsync(mesh)
      },
    })
    this.diagnosticPlanetVisualConstructions += 1
    record = Object.freeze({ datum, descriptor, visual, orbit })
    this.visualByQuestion.set(datum.question.id, record)
    this.refreshPlanetMeshIndex(record)
    this.updatePlanetPosition(record, 0)
    void visual.ensureLod(this.quality === 'low' ? 'low' : 'medium')
    void visual.ensureAtmosphere()
  }

  private materializeStarSystem(star: StarDatum): void {
    const ownerKey = starOwnerKey(star)
    if (this.materializedOwnerKey === ownerKey) return
    this.releaseMaterializedPlanets()
    this.materializedOwnerKey = ownerKey
    try {
      for (const planet of materializedPlanetsForStar(this.planets, star)) this.createPlanet(planet)
    } catch (cause) {
      this.releaseMaterializedPlanets()
      throw cause
    }
  }

  private releaseMaterializedPlanets(): void {
    for (const record of this.visualByQuestion.values()) {
      record.visual.dispose()
      record.orbit.dispose(false, true)
    }
    this.visualByQuestion.clear()
    this.visualByMeshId.clear()
    this.materializedOwnerKey = null
  }

  private hasActiveAnimation(): boolean {
    const cameraMoving = [
      this.camera.inertialAlphaOffset,
      this.camera.inertialBetaOffset,
      this.camera.inertialRadiusOffset,
      this.camera.inertialPanningX,
      this.camera.inertialPanningY,
    ].some((value) => Math.abs(value) > 1e-5)
    return Boolean(this.activeFlight || this.selected || this.strataTransition.phase !== null
      || this.planetExitPending || this.hoverKey || this.pressedKey || cameraMoving)
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

  /**
   * 背景层每帧只做三件事：按绝对时间转壳、更新景深范围、按距离与聚焦退让。
   *
   * 星云按方向采样，亮度与距离无关 —— 飞进一个恒星系之后画面上只剩几个天体，
   * 它就成了压倒性的奶白底。它是背景，靠近时必须退场。
   */
  private updateBackground(renderHeight: number): void {
    if (!this.universeVisible) {
      this.nebula?.setDim(0)
      this.dust?.setDim(0)
      this.starfield?.setPhaseOpacity(0)
      return
    }
    const radius = this.sceneRadius
    const originDistance = this.camera.globalPosition.length()
    // 空间雾：远处按分档收进来，于是同一屏里「远」和「近」分得开。
    const { near, far } = spaceFogWindow(radius, originDistance, babylonUpliftTier(this.quality))
    const nearK = 0.22 + 0.78 * smoothStep(this.camera.radius, radius * 0.35, radius * 1.1)
    // 进到一颗问题行星就是地表阶段：星空、星云、尘埃全部退场，不留余晖。
    // 留一点就还是「一颗球飘在宇宙里」，那不是地表。
    const focusRetreat = backdropGain(this.diagnosticPhase() === 'universe'
      ? (this.selected ? 'planet-focus' : this.focusedStar ? 'star-focus' : 'panorama')
      : 'strata')
    this.backdropGainValue = focusRetreat
    const modeGain = this.mode === 'all' ? 1 : 0.48
    this.nebula?.setDim(modeGain * nearK * focusRetreat)
    this.nebula?.update(this.motionTime() * 0.001)
    this.dust?.setDim(nearK * focusRetreat)
    this.dust?.setUniform('uT', this.motionTime())
    this.dust?.setUniform('uNear', near)
    this.dust?.setUniform('uFar', far)
    const projectionScale = renderHeight * 0.5 / Math.tan(this.camera.fov * 0.5)
    this.dust?.setUniform('uProjScale', projectionScale)
    // 星场跟着相机退让，但保留底噪：背景一旦全黑，近景就失去可参照的远处。
    this.starfield?.setPhaseOpacity(nearK * focusRetreat)
    this.starfield?.update(this.motionTime(), projectionScale)
    for (const layer of [this.rings, this.overlay]) {
      layer?.setUniform('uNear', near)
      layer?.setUniform('uFar', far)
    }
    // 星群结构环是全景尺度的信号，推进到单个恒星系后只剩遮挡 —— 靠近时退场。
    this.rings?.setUniform(
      'uGain',
      CLUSTER_RING_GAIN * focusRetreat * clusterRingOpacity(this.camera.radius, this.overviewRadius),
    )
    this.overlay?.setUniform('uT', this.motionTime())
    this.overlay?.setUniform('uProjScale', projectionScale)
    this.drawLabels(radius, near, far)
    this.updatePlanetSurface()
    this.probeLayer?.update({
      elapsedMs: this.motionTime(),
      projectionScale,
      focusedStarId: this.focusedStar && 'id' in this.focusedStar.s ? this.focusedStar.s.id : null,
      starPositions: this.probeStarPositions(),
      starOpacities: this.probeStarOpacities(),
    })
  }

  private probeStarPositions(): ReadonlyMap<string, Vector3> {
    const positions = new Map<string, Vector3>()
    for (const datum of this.stars) {
      if (!('id' in datum.s) || !(datum.s.probeIds as readonly string[] | undefined)?.length) continue
      positions.set(datum.s.id, this.currentStarPosition(datum).clone())
    }
    return positions
  }

  private probeStarOpacities(): ReadonlyMap<string, number> {
    const opacities = new Map<string, number>()
    const focusedId = this.focusedStar && 'id' in this.focusedStar.s ? this.focusedStar.s.id : null
    for (const datum of this.stars) {
      if (!('id' in datum.s) || !(datum.s.probeIds as readonly string[] | undefined)?.length) continue
      const dim = renderDim(datum.s, this.mode, this.universe, this.wormIdx)
      const focusFactor = focusedId === null || focusedId === datum.s.id ? 1 : NON_FOCUSED_OPACITY
      opacities.set(datum.s.id, dim * focusFactor)
    }
    return opacities
  }

  private applyLayerFocus(star: StarDatum | null): void {
    this.rings?.setFocus(star && 'g' in star.s ? star.s.g : null)
    this.overlay?.setFocus(star?.s ?? null)
    this.labelStrategy.setFocus(star)
  }

  /**
   * 星群名与重要恒星名。铺在 3D 画布之上、不参与 bloom —— 让标签发光只会让
   * 它们变得读不清。
   */
  private drawLabels(radius: number, near: number, far: number): void {
    if (!this.labels) return
    // 与锚点同理：这段跑在 scene.render 之前，渲染又被节流，旧的视图矩阵配新的天体位置
    // 会让字在两个位置之间来回跳。投影前统一刷新到当前相机。
    this.scene.updateTransformMatrix()
    // 地表阶段没有星群名与恒星名 —— 那是宇宙导航信息，站在行星上不成立。
    // 有的是天上的邻居：同恒星系的问题、虫洞通向的星群。
    if (this.backdropGainValue <= 0) {
      this.labels.draw({
        clusters: [], stars: [], near, far, tooClose: radius * 0.2,
        surface: this.surfaceLabels(),
        project: () => ({ x: 0, y: 0, depth: -1, distance: 0 }),
        projectStar: () => ({ x: 0, y: 0, depth: -1, distance: 1, radiusPx: 0 }),
      })
      return
    }
    const rect = this.canvas.getBoundingClientRect()
    const renderHeight = Math.max(1, this.engine.getRenderHeight())
    const projectionScale = renderHeight * 0.5 / Math.tan(this.camera.fov * 0.5)
    const cameraPosition = this.camera.globalPosition
    this.labels.draw({
      clusters: this.labelStrategy.clusterLabels,
      stars: this.labelStrategy.starLabels,
      near,
      far,
      tooClose: radius * 0.2,
      project: (point) => {
        const world = this.labelPointScratch.set(point[0], point[1], point[2])
        const projected = this.projectToCss(world)
        return {
          x: projected.x, y: projected.y, depth: projected.z,
          distance: Vector3.Distance(world, cameraPosition),
        }
      },
      projectStar: (star) => {
        const world = starWorldPosition(
          star, this.motionTime(), this.reducedMotion ? 0 : 1.35, this.labelPointScratch,
        )
        const projected = this.projectToCss(world)
        const distance = Math.max(1, Vector3.Distance(world, cameraPosition))
        return {
          x: projected.x, y: projected.y, depth: projected.z, distance,
          radiusPx: star.bodyR * projectionScale / distance * rect.height / renderHeight,
        }
      },
    })
  }

  private framingPhase(): FramingPhase {
    if (this.selected) return 'planet-focus'
    return this.focusedStar ? 'star-focus' : 'panorama'
  }

  /** 由轨道半径导出，恒星因此始终留在画面里当光源。 */
  private planetFraming(planet: PlanetDatum): Readonly<{ distance: number; low: number; high: number }> {
    const distance = planetFocusDistance(planet.orbitR)
    const bounds = wheelRadiusBounds('planet-focus', { sceneRadius: this.sceneRadius })
    const system = this.focusedStar ? this.systemFramingRadius(this.focusedStar) : distance * 2
    return Object.freeze({ distance, low: bounds.low, high: Math.max(distance, system) })
  }

  private systemFramingRadius(star: StarDatum): number {
    try {
      return this.systemFraming(star).radius
    } catch {
      return this.overviewRadius * 0.72
    }
  }

  private scenePhase(): BabylonScenePhase {
    if (!this.universeVisible) return 'strata'
    if (this.selected) return 'planet-focus'
    return this.focusedStar ? 'star-focus' : 'panorama'
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
    const bloom = babylonBloomPolicy(this.scenePhase(), this.quality)
    this.pipeline.bloomEnabled = bloom.enabled
    this.pipeline.bloomKernel = bloom.kernel
    for (const visual of this.visualByQuestion.values()) {
      const ownerKey = starOwnerKey(visual.datum.star)
      applyOrbitLineAlpha(visual.orbit, questionOrbitAlpha({
        ...state,
        ownerKey,
        questionId: visual.datum.question.id,
        belt: visual.datum.belt,
      }))
      const planet = questionPlanetPresentation({ ...state, ownerKey })
      visual.visual.setReveal(planet.reveal)
      visual.visual.setVisible(planet.visible)
      for (const mesh of visual.visual.meshes) mesh.isPickable = planet.pickable && !mesh.name.includes(':atmosphere')
    }
  }

  private updateScene(): void {
    if (this.destroyed) return
    const now = performance.now()
    const deltaTime = elapsedRenderDelta(this.lastSceneUpdateAt, now)
    this.lastFrameDeltaMs = deltaTime
    if (Number.isFinite(now)) this.lastSceneUpdateAt = now
    this.elapsedMs += this.reducedMotion || this.diagnosticApproachProgressOverride != null ? 0 : deltaTime
    this.updateCameraFlight()
    this.planetFocusController.update(deltaTime)
    this.syncCameraControl()
    if (this.planetExitPending && this.planetFocusController.state === 'idle') {
      this.planetExitPending = false
      this.finishPlanetExit()
    }
    this.updateStellarPresentation(deltaTime)
    const renderHeight = Math.max(1, this.engine.getRenderHeight())
    const dpr = cappedDevicePixelRatio(window.devicePixelRatio, mobileDevice(), this.quality)
    this.updateBackground(renderHeight)
    this.starLayer.update({
      elapsedMs: this.elapsedMs,
      renderHeight,
      devicePixelRatio: dpr,
      projectionScale: renderHeight * 0.5 / Math.tan(this.camera.fov * 0.5),
    })
    this.diagnosticPlanetUpdatesLastFrame = 0
    for (const visual of this.visualByQuestion.values()) {
      if (!shouldUpdateMaterializedPlanet(this.universeVisible, visual.visual.activeMesh.isEnabled())) continue
      this.updatePlanetPosition(visual, this.elapsedMs)
      const mesh = visual.visual.activeMesh
      const distance = Vector3.Distance(this.camera.globalPosition, mesh.getAbsolutePosition())
      this.diagnosticPlanetUpdatesLastFrame += 1
      visual.visual.update({
        elapsedMs: this.motionTime(),
        cameraPosition: this.camera.globalPosition,
        starPosition: this.currentStarPosition(visual.datum.star),
        projectedRadiusPx: projectedSphereDiameterPixels(
          visual.visual.radius,
          distance,
          this.camera.fov,
          this.engine.getRenderWidth(),
          this.engine.getRenderHeight(),
        ) / 2,
        focused: visual === this.selectedVisual,
      })
    }
    if (surfaceCameraOwned(this.surfaceStage)) {
      // 地表拥有相机：聚焦控制器每帧把注视点拷回行星中心会把人拽进行星内部。
    } else if (this.selected && this.selectedVisual && this.universeVisible) {
      if (this.planetFocusController.state === 'focused') {
        this.camera.target.copyFrom(this.selectedVisual.visual.activeMesh.position)
      }
      this.updateAnchor(this.selectedVisual.visual.activeMesh)
    } else if (this.focusedStar && !this.activeFlight && this.universeVisible) {
      this.camera.target.copyFrom(this.currentStarPosition(this.focusedStar))
    }
    this.applyProbeInspectionCamera()
    if (import.meta.env.VITE_E2E_DIAGNOSTICS === '1') {
      // 这里跑在 scene.render 之前，所以带的是上一帧的开销 —— 在 260 个样本的
      // 序列上错开一帧不影响分位数，而这是唯一能拿到逐帧开销的时机。
      recordE2EFrame(this, deltaTime, 0, performance.now(), this.runtime.diagnostics().lastRenderCostMs)
    }
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

  private prepareDiagnosticPlanetCapture(): boolean {
    const record = this.selectedVisual
    if (!record || !this.universeVisible) return false
    const target = record.visual.activeMesh.getAbsolutePosition().clone()
    const light = this.currentStarPosition(record.datum.star).subtract(target)
    let side = Vector3.Cross(light, Vector3.Up())
    if (side.lengthSquared() < 1e-8) side = Vector3.Right()
    side.normalize().scaleInPlace(this.camera.radius)
    this.camera.setTarget(target)
    this.camera.setPosition(target.add(side).add(Vector3.Up().scale(this.camera.radius * 0.12)))
    return true
  }

  private flipDiagnosticFarPlanetCapture(): boolean {
    if (!this.focusedStar || this.selectedVisual || !this.universeVisible) return false
    this.camera.alpha += Math.PI
    return true
  }

  private diagnosticScene(): RenderSnapshot['scene'] {
    const firstStar = this.stars[0] ? this.projectToCss(this.currentStarPosition(this.stars[0])) : null
    return {
      planetCount: this.planets.length,
      probeCount: this.probeLayer?.diagnostics().probeCount ?? this.probes.size,
      probeNearVisible: (this.probeLayer?.diagnostics().nearOpacity ?? 0) > 0.001,
      firstStarX: firstStar?.x ?? null,
      firstStarY: firstStar?.y ?? null,
      cameraDistance: this.camera.radius,
      targetDistance: this.camera.radius,
      cameraAlpha: this.camera.alpha,
      cameraBeta: this.camera.beta,
      cameraTargetX: this.camera.target.x,
      cameraTargetY: this.camera.target.y,
      cameraTargetZ: this.camera.target.z,
      cameraUp: [this.camera.upVector.x, this.camera.upVector.y, this.camera.upVector.z],
      strataPose: this.strataTransition.pose,
      undatedRoom: this.strataTransition.layout?.undatedRoom
        ? {
            centerDepth: this.strataTransition.layout.undatedRoom.centerDepth,
            angle: this.strataTransition.layout.undatedRoom.angle,
          }
        : null,
    }
  }

  private diagnosticStellar(): StellarDiagnosticsSnapshot {
    const projectedStars = this.stars.flatMap((star) => {
      if (!this.isInteractive(star) || !this.universeVisible) return []
      const projected = this.projectToCss(this.currentStarPosition(star))
      if (projected.z < 0 || projected.z > 1) return []
      const visual = describeStarVisual(star)
      const focusedBodyVisible = star === this.focusedStar && this.presentation.lodIntent !== 'point'
      const rect = this.canvas.getBoundingClientRect()
      const focusedCoreSize = star.bodyR * rect.height
        / Math.max(0.001, Math.tan(this.camera.fov * 0.5) * this.camera.radius)
      const coreSize = focusedBodyVisible ? Math.max(visual.panoramaCorePx, focusedCoreSize) : visual.panoramaCorePx
      const haloSize = focusedBodyVisible
        ? Math.max(visual.panoramaHaloPx, focusedCoreSize * visual.coronaScale)
        : visual.panoramaHaloPx
      return [{
        starKey: starIdentity(star.s),
        core: { x: projected.x - coreSize / 2, y: projected.y - coreSize / 2, width: coreSize, height: coreSize },
        halo: { x: projected.x - haloSize / 2, y: projected.y - haloSize / 2, width: haloSize, height: haloSize },
      }]
    })
    const approachProgress = this.activeFlight && this.activeFlight.flight.durationMs > 0
      ? Math.min(1, this.activeFlight.elapsedMs / this.activeFlight.flight.durationMs)
      : this.focusedStar ? 1 : 0
    return {
      starCount: this.stars.length,
      projectedStars,
      hoveredStarKey: this.hoverKey,
      hoverProgress: this.hoverProgress,
      focusedStarKey: this.focusedStar ? starIdentity(this.focusedStar.s) : null,
      approachProgress,
      approachDurationMs: this.lastFlightDurationMs,
      reducedMotion: this.reducedMotion,
      systemReveal: this.presentation.systemReveal,
      visibleQuestionOrbits: [...this.visualByQuestion.values()].filter(({ orbit }) => orbit.isEnabled() && orbit.alpha > 0).length,
      visibleQuestionPlanets: [...this.visualByQuestion.values()].filter(({ visual }) => visual.activeMesh.isEnabled()).length,
      cameraSamples: this.diagnosticCameraSamples ?? [],
      shaderFallback: this.starLayer.diagnostics().stellarShaderFallback,
    }
  }

  private selectedPlanetBounds(): RenderSnapshot['projectedBounds']['selectedPlanet'] {
    const visual = this.selectedVisual?.visual
    if (!visual || !this.universeVisible) return null
    return this.planetBounds(visual.activeMesh, visual.radius)
  }

  private planetBounds(mesh: Mesh, surfaceRadius: number): RenderSnapshot['projectedBounds']['selectedPlanet'] {
    if (!this.universeVisible) return null
    mesh.computeWorldMatrix(true)
    const sphere = mesh.getBoundingInfo().boundingSphere
    const center = this.projectToCss(sphere.centerWorld)
    const rect = this.canvas.getBoundingClientRect()
    const diameter = projectedSphereDiameterPixels(
      surfaceRadius,
      Vector3.Distance(this.camera.globalPosition, sphere.centerWorld),
      this.camera.fov,
      rect.width,
      rect.height * this.camera.viewport.height,
    )
    return { x: center.x - diameter / 2, y: center.y - diameter / 2, width: diameter, height: diameter }
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

  private updatePlanetPosition(visual: PlanetVisualRecord, elapsedMs: number): void {
    const datum = visual.datum
    // 恒星位置永远用活时钟（它还在绕星群中心走、上下浮动，镜头跟着它）；公转按节奏：
    // 全景全速、恒星系慢速、选中行星时停住。换节奏以当前时刻为锚点，行星不会瞬移。
    const frameTimeMs = this.reducedMotion ? 0 : elapsedMs
    this.orbitClock = retimeOrbitClock(this.orbitClock, frameTimeMs, orbitTempoFor({
      starFocused: this.focusedStar !== null,
      planetSelected: this.selected !== null,
    }))
    const orbitTimeMs = this.reducedMotion ? 0 : orbitClockTime(this.orbitClock, frameTimeMs)
    const starPosition = starWorldPosition(
      datum.star,
      frameTimeMs,
      this.reducedMotion ? 0 : 1.35,
      this.planetStarPositionScratch,
    )
    visual.visual.setPosition(orbitPositionOf(datum, starPosition, orbitTimeMs, this.planetPositionScratch))
    // 自转用活时钟：选中时公转停住（不再是移动靶），但它得继续转，否则就是一颗死球。
    // 自转不改变屏幕位置，点击精度不受影响。
    visual.visual.setSpin(planetSpinAngle(datum.material.seed, frameTimeMs))
    visual.orbit.position.set(
      starPosition.x - datum.star.p[0],
      starPosition.y - datum.star.p[1],
      starPosition.z - datum.star.p[2],
    )
  }

  /** 某颗行星此刻的世界位置（不依赖它是否已实体化）。 */
  private planetWorldPositionAt(datum: PlanetDatum, frameTimeMs: number, orbitTimeMs: number): Vector3 {
    const starPosition = starWorldPosition(datum.star, frameTimeMs, this.reducedMotion ? 0 : 1.35, new Vector3())
    return orbitPositionOf(datum, starPosition, orbitTimeMs, new Vector3())
  }

  private refreshPlanetMeshIndex(record: PlanetVisualRecord): void {
    for (const [meshId, candidate] of this.visualByMeshId) {
      if (candidate === record) this.visualByMeshId.delete(meshId)
    }
    for (const mesh of record.visual.meshes) {
      if (!mesh.name.includes(':atmosphere')) this.visualByMeshId.set(mesh.uniqueId, record)
    }
  }

  private finishPlanetExit(): void {
    this.syncCameraControl()
    const record = this.selectedVisual
    if (!record) return
    record.visual.setSelected(false)
    record.visual.setLod(this.quality === 'low' ? 'low' : 'medium')
    this.selected = null
    this.selectedVisual = null
    this.callbacks.onAnchor?.(0, 0, false)
    this.callbacks.onPickPlanet?.(null)
    this.syncOrbitPresentation()
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
    // 相机矩阵与行星位置必须取自同一时刻。这段跑在 scene.render 之前，而渲染被节流到
    // 30fps —— 于是有些帧拿到的是上一次渲染留下的视图矩阵，配上这一帧已经前进的行星
    // 位置，锚点就在两个值之间来回跳（实测 641.46/642.17 两簇，卡片肉眼可见地抖）。
    mesh.computeWorldMatrix(true)
    this.scene.updateTransformMatrix()
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

  /** 选中行星的世界包围球半径。相机半径与它同一套单位，descriptor.radius 不是。 */
  private selectedPlanetWorldRadius(): number {
    const mesh = this.selectedVisual?.visual.activeMesh
    if (!mesh) return 0.25
    const radius = mesh.getBoundingInfo().boundingSphere.radiusWorld
    return Number.isFinite(radius) && radius > 0 ? radius : 0.25
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
    this.applyStrataDepthAtmosphere(pose.depth)
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

  /**
   * 深度分级的雾与跟随的引导光。
   *
   * 竖井里没有地平线，雾是唯一的距离线索；越深越暗越浓，于是「还能往下」
   * 与「快到底了」在画面上分得开。
   */
  private applyStrataDepthAtmosphere(depth: number): void {
    const fog = strataDepthFog(depth, this.caveMaxDepth)
    this.scene.fogDensity = fog.density
    this.scene.fogColor = new Color3(fog.color[0], fog.color[1], fog.color[2])
    const guide = this.caveGuideLight
    if (guide) guide.position.y = strataGuideLight(depth, babylonUpliftTier(this.quality)).y
  }

  /**
   * 进入可环绕地表：宇宙退场，脚下换成这颗行星的真实地形。
   *
   * 落点取当前相机方向在行星上的投影 —— 你从哪个方向飞下去，就落在那一面，
   * 而不是每次都落在同一个「默认点」。
   */
  enterPlanetSurface(questionId: string, options: PlanetSurfaceEntry = {}): boolean {
    if (this.destroyed || !this.selectedVisual) return false
    if (this.selectedVisual.datum.question.id !== questionId) return false
    const { field, displacement } = createPlanetTerrainSource(
      this.selectedVisual.descriptor, this.quality,
    )
    const centre = this.selectedVisual.visual.activeMesh.position
    const camera = this.camera.globalPosition
    const away = new Vector3(camera.x - centre.x, camera.y - centre.y, camera.z - centre.z)
    const approach: readonly [number, number, number] = away.lengthSquared() > 1e-9
      ? [away.x / away.length(), away.y / away.length(), away.z / away.length()]
      : [0, 1, 0]
    // 正对镜头的那一面通常是夜面（恒星在行星背后）；落点挪到白天那一面。
    const star = this.focusedStar ? this.currentStarPosition(this.focusedStar) : null
    const landing: readonly [number, number, number] = landingSite(approach, star
      ? [star.x - centre.x, star.y - centre.y, star.z - centre.z]
      : approach)

    this.disposeSurfaceWorld()
    const root = new TransformNode('planet-surface-root', this.scene)
    root.position.copyFrom(centre)
    this.surfaceRoot = root
    this.surfaceRadius = this.selectedPlanetWorldRadius()
    this.surfaceDisplacement = displacement
    this.surfaceGround = new PlanetGround(this.scene, {
      radius: this.surfaceRadius,
      thermal: this.selectedVisual.descriptor.thermal,
      seed: this.selectedVisual.descriptor.seed,
    })
    this.surfaceWorld = new PlanetSurfaceWorld(this.scene, root, {
      material: this.surfaceGround.material,
      field,
      radius: this.surfaceRadius,
      displacement,
      resolution: this.quality === 'high' ? 8 : this.quality === 'medium' ? 6 : 4,
      // 每帧限量建块。实测一次性建 303 块会造成 2086ms 的单帧卡死，把俯冲动画整个吞掉。
      buildBudgetPerUpdate: this.quality === 'low' ? 8 : 12,
      skirtDepth: 0.02,
      albedo: thermalGroundAlbedo(this.selectedVisual.descriptor.thermal),
      maxDepth: this.quality === 'low' ? 4 : 5,
      detailAngle: 0.35,
      budget: this.quality === 'high' ? 400 : 240,
    })
    this.surfaceSky = new PlanetSky(this.scene, root, {
      radius: this.surfaceRadius * 6,
      thermal: this.selectedVisual.descriptor.thermal,
    })
    const sunDirection = this.surfaceSunDirection()
    this.surfaceSun = new DirectionalLight('planet-surface:sun',
      new Vector3(-sunDirection[0], -sunDirection[1], -sunDirection[2]), this.scene)
    this.surfaceSun.parent = root
    this.surfaceSun.intensity = 1.15
    this.surfaceAmbient = new HemisphericLight('planet-surface:sky-light',
      new Vector3(landing[0], landing[1], landing[2]), this.scene)
    this.surfaceAmbient.parent = root
    this.surfaceAmbient.intensity = 0.42
    this.surfaceAmbient.groundColor = new Color3(0.05, 0.045, 0.04)
    this.surfaceField = field
    // 天上的邻居：同恒星系的其他问题按此刻的真实方向挂在天上；选中行星时公转停住，
    // 恒星漂移带着整个系一起走，方向在这次停留里不变。
    const selectedStar = this.selectedVisual.datum.star
    const frameTimeMs = this.reducedMotion ? 0 : this.elapsedMs
    const orbitTimeMs = this.reducedMotion ? 0 : orbitClockTime(this.orbitClock, frameTimeMs)
    const beacons = surfaceBeaconsFor({
        centre: [centre.x, centre.y, centre.z],
        up: landing,
        questionId,
        clusterId: selectedStar.s.g,
        siblings: this.planets
          .filter((planet) => planet.star === selectedStar && 'id' in planet.star.s)
          .map((planet) => {
            const position = this.planetWorldPositionAt(planet, frameTimeMs, orbitTimeMs)
            return {
              questionId: planet.question.id, starId: (planet.star.s as { id: string }).id,
              title: planet.question.title, position: [position.x, position.y, position.z] as const,
            }
          }),
        clusters: this.universe?.clusters ?? [],
        wormholes: this.universe?.wormholes ?? [],
      })
    this.surfaceBeacons = new PlanetSurfaceBeacons(this.scene, root, {
      radius: this.surfaceRadius,
      origin: [landing[0] * this.surfaceRadius, landing[1] * this.surfaceRadius, landing[2] * this.surfaceRadius],
      beacons,
    })
    // 下一站：从落点铺一条小径指向你在时间上接着看的那个问题，尽头一块路牌。
    const next = options.nextStation ?? null
    const nextPlanet = next ? this.planets.find((planet) => planet.question.id === next.questionId) ?? null : null
    this.surfaceSignpost = null
    let nextBearing: readonly [number, number, number] | null = null
    if (next && nextPlanet) {
      const target = this.planetWorldPositionAt(nextPlanet, frameTimeMs, orbitTimeMs)
      nextBearing = [target.x - centre.x, target.y - centre.y, target.z - centre.z]
      this.surfaceTrail = new PlanetSurfaceTrail(this.scene, root, {
        field, radius: this.surfaceRadius, displacement, layout: layoutSurfaceTrail(landing, nextBearing),
      })
      this.surfaceSignpost = {
        questionId: next.questionId, starId: next.starId,
        text: `${formatTraceMonth(next.at)} 你从这里去了 → 《${next.title.length > 16 ? `${next.title.slice(0, 16)}…` : next.title}》`,
      }
    }
    // 站在落点上，眼高按行星半径取比例，换一颗大小不同的行星观感一致。
    // 朝向：有下一站就面朝那条小径（落地就看见自己走过的路）；否则朝天上第一个邻居。
    const facingHint = nextBearing ?? (beacons.find(({ kind }) => kind === 'planet') ?? beacons[0])?.direction
    this.surfacePose = standAt(landing, this.surfaceRadius * 0.012, facingHint)
    // 你留下的痕迹就在落点前方的视野里。
    this.surfaceMarks = new PlanetSurfaceMarks(this.scene, root, {
      field, radius: this.surfaceRadius, displacement,
      // 有小径时把痕迹让到小径右侧 40°，否则第一面旗正好插在路牌上。
      placements: layoutSurfaceMarks(
        landing, this.surfacePose.facing, surfaceMarksFor(this.selectedVisual.datum.answers),
        this.surfaceTrail ? Math.PI * 40 / 180 : 0,
      ),
    })
    this.surfaceStage = advanceSurfaceStage(this.surfaceStage, {
      kind: 'enter', questionId, landing,
    })
    // 俯冲的起点就是此刻的机位 —— 从你飞过来的地方一路落下去，不做瞬移。
    // 时钟归零：它要等地表建够才起步，并且按帧推进而不是墙钟。
    this.descentClock = IDLE_DESCENT_CLOCK
    this.surfaceDescent = Object.freeze({
      from: this.camera.globalPosition.clone(),
      fromTarget: this.camera.target.clone(),
    })
    // 着色器提前编译：否则它会和第一批地块挤在同一帧。best-effort，失败只是回到原样。
    void this.surfaceGround?.warm()
    this.applySurfaceVisibility()
    return true
  }

  /** 离开地表回到轨道。俯冲途中也必须能退，否则会卡在半空。 */
  exitPlanetSurface(): void {
    if (this.surfaceStage.phase === 'idle') return
    this.surfaceStage = advanceSurfaceStage(this.surfaceStage, { kind: 'exit' })
    this.disposeSurfaceWorld()
    this.applySurfaceVisibility()
  }

  /** 行走输入。只有站稳之后才接受 —— 俯冲途中或下潜中走会同时跑两套相机。 */
  walkPlanetSurface(input: Readonly<{
    forward: number; strafe: number; turn: number; tilt: number
  }>): boolean {
    if (!surfaceWalkEnabled(this.surfaceStage) || !this.surfacePose) return false
    this.surfacePose = walkSurface(this.surfacePose, input)
    return true
  }

  /**
   * 点到落点旁的旗或石堆：返回那条回答的 id。没点中返回 null。
   *
   * 屏幕空间邻近拾取，不逐像素打网格：旗杆只有几像素宽，逐像素就又是「点击区域太小」。
   */
  pickPlanetSurface(clientX: number, clientY: number): SurfacePick | null {
    if (this.destroyed || !surfaceCameraOwned(this.surfaceStage)) return null
    const rect = this.canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top
    this.diagnosticSurfacePickCalls += 1
    let winner: SurfacePick | null = null
    let best = SURFACE_MARK_PICK_RADIUS_PX * SURFACE_MARK_PICK_RADIUS_PX
    for (const mark of this.surfaceMarkProjections()) {
      // 锚点在杆底；旗和石堆都往上长，命中区往上偏一点。
      const dx = mark.x - x
      const dy = mark.y - SURFACE_MARK_PICK_LIFT_PX - y
      const distance = dx * dx + dy * dy
      if (distance <= best) { best = distance; winner = { kind: 'mark', answerId: mark.answerId } }
    }
    if (winner) return winner
    const signpost = this.surfaceSignpostProjection()
    if (signpost && this.surfaceSignpost) {
      const dx = signpost.x - x
      const dy = signpost.y - SURFACE_MARK_PICK_LIFT_PX - y
      if (dx * dx + dy * dy <= SURFACE_BEACON_PICK_RADIUS_PX * SURFACE_BEACON_PICK_RADIUS_PX) {
        return { kind: 'signpost', questionId: this.surfaceSignpost.questionId, starId: this.surfaceSignpost.starId }
      }
    }
    best = SURFACE_BEACON_PICK_RADIUS_PX * SURFACE_BEACON_PICK_RADIUS_PX
    for (const beacon of this.surfaceBeaconProjections()) {
      const dx = beacon.x - x
      const dy = beacon.y - y
      const distance = dx * dx + dy * dy
      if (distance > best) continue
      best = distance
      winner = beacon.kind === 'wormhole'
        ? { kind: 'wormhole', wormholeIndex: beacon.wormholeIndex ?? 0 }
        : { kind: 'planet', questionId: beacon.questionId ?? '', starId: beacon.starId ?? '' }
    }
    return winner
  }

  /** 天上信标在屏幕上的位置（只含相机前方的）。 */
  private surfaceBeaconProjections(): readonly {
    kind: 'planet' | 'wormhole'; key: string; label: string; x: number; y: number
    questionId?: string; starId?: string; wormholeIndex?: number
  }[] {
    const beacons = this.surfaceBeacons
    const root = this.surfaceRoot
    if (!beacons || !root || !surfaceCameraOwned(this.surfaceStage)) return []
    return beacons.anchors().flatMap(({ beacon, local }) => {
      const projected = this.projectToCss(local.addInPlace(root.position))
      if (!(projected.z > 0 && projected.z < 1)) return []
      return [{
        kind: beacon.kind, key: beacon.key, label: beacon.label, x: projected.x, y: projected.y,
        ...(beacon.questionId === undefined ? {} : { questionId: beacon.questionId }),
        ...(beacon.starId === undefined ? {} : { starId: beacon.starId }),
        ...(beacon.wormholeIndex === undefined ? {} : { wormholeIndex: beacon.wormholeIndex }),
      }]
    })
  }

  /** 路牌在屏幕上的位置（相机前方时）。 */
  private surfaceSignpostProjection(): { x: number; y: number; text: string } | null {
    const trail = this.surfaceTrail
    const root = this.surfaceRoot
    const signpost = this.surfaceSignpost
    if (!trail || !root || !signpost || !surfaceCameraOwned(this.surfaceStage)) return null
    const anchor = trail.signpost()
    if (!anchor) return null
    const projected = this.projectToCss(anchor.addInPlace(root.position))
    return projected.z > 0 && projected.z < 1 ? { x: projected.x, y: projected.y, text: signpost.text } : null
  }

  /** 地表阶段画的字：天上的邻居、地上的路牌。 */
  private surfaceLabels(): readonly SurfaceLabel[] {
    const labels: SurfaceLabel[] = this.surfaceBeaconProjections().map((beacon) => ({
      text: beacon.label, x: beacon.x, y: beacon.y - 14, tone: beacon.kind === 'wormhole' ? 'wormhole' : 'sibling',
    }))
    const signpost = this.surfaceSignpostProjection()
    if (signpost) labels.push({ text: signpost.text, x: signpost.x, y: signpost.y - 26, tone: 'signpost' })
    return labels
  }

  /** 标记在屏幕上的位置，供门禁去点。 */
  private surfaceMarkProjections(): readonly { answerId: string; x: number; y: number }[] {
    const marks = this.surfaceMarks
    const root = this.surfaceRoot
    if (!marks || !root || !surfaceCameraOwned(this.surfaceStage)) return []
    return marks.answerIds().flatMap((answerId) => {
      const anchor = marks.anchorOf(answerId)
      if (!anchor) return []
      const projected = this.projectToCss(anchor.addInPlace(root.position))
      return projected.z > 0 && projected.z < 1 ? [{ answerId, x: projected.x, y: projected.y }] : []
    })
  }

  surfaceStageDiagnostics(): Readonly<{
    phase: SurfaceStageState['phase']
    descent: number
    chunkCount: number
    meshCount: number
    builtThisUpdate: number
    vertexCount: number
    skyVisible: boolean
    groundRadius: number
    cameraTargetDistance: number
    lightCount: number
    /** 相机到星心的距离，以行星半径为单位。站在地上约 1.01。 */
    cameraAltitude: number
    /** 太阳相对脚下法线的高度角余弦。负数是夜面。 */
    sunElevation: number
    markCount: number
    beaconCount: number
    trailSteps: number
    /** 还欠多少地形块没建。 */
    pendingChunks: number
    /** 当前 LOD 的块是否已建够。俯冲等这个信号才起步。 */
    worldReady: boolean
    descentStarted: boolean
  }> {
    const world = this.surfaceWorld?.diagnostics()
    const frame = this.surfacePose && this.surfaceField
      ? surfaceFrame(this.surfacePose, this.surfaceField, this.surfaceRadius, this.surfaceDisplacement)
      : null
    return Object.freeze({
      phase: this.surfaceStage.phase,
      descent: this.surfaceStage.descent,
      chunkCount: world?.chunkCount ?? 0,
      meshCount: world?.meshCount ?? 0,
      builtThisUpdate: world?.builtThisUpdate ?? 0,
      vertexCount: world?.vertexCount ?? 0,
      skyVisible: surfaceSkyVisible(this.surfaceStage),
      groundRadius: frame?.groundRadius ?? 0,
      cameraTargetDistance: Vector3.Distance(this.camera.globalPosition, this.camera.target),
      lightCount: (this.surfaceSun ? 1 : 0) + (this.surfaceAmbient ? 1 : 0),
      cameraAltitude: this.surfaceRoot
        ? Vector3.Distance(this.camera.globalPosition, this.surfaceRoot.position) / Math.max(1e-6, this.surfaceRadius)
        : 0,
      sunElevation: frame ? (() => {
        const sun = this.surfaceSunDirection()
        return frame.up[0] * sun[0] + frame.up[1] * sun[1] + frame.up[2] * sun[2]
      })() : 0,
      markCount: this.surfaceMarks?.diagnostics().markCount ?? 0,
      pendingChunks: world?.pendingCount ?? 0,
      worldReady: world?.ready ?? false,
      descentStarted: this.descentClock.started,
      beaconCount: this.surfaceBeacons?.diagnostics().beaconCount ?? 0,
      trailSteps: this.surfaceTrail?.diagnostics().stepCount ?? 0,
    })
  }

  private applySurfaceVisibility(): void {
    const present = surfaceWorldVisible(this.surfaceStage)
    this.surfaceRoot?.setEnabled(present)
    this.surfaceSky?.setDim(surfaceSkyVisible(this.surfaceStage) ? 1 : 0)
    // 站在地表上时宇宙必须整个退场 —— 这个阶段没有轨道视角。
    // 但**不能反过来主动点亮**：往下挖时 present 变 false，而那一刻 universeVisible
    // 还是 true（setUniverseVisible(false) 由地层过渡稍后才调），照着点亮会把整个
    // 宇宙塞回洞穴里。宇宙的开关归 setUniverseVisible 管，这里只负责按下去。
    if (present) this.universeRoot.setEnabled(false)
    else if (this.surfaceStage.phase === 'idle' && this.universeVisible) {
      this.universeRoot.setEnabled(true)
    }
    // 地表不再驱动相机时，把 up 轴交还给世界 Y。地表相机只往 upVector 里写脚下的法线，
    // 从不还原 —— 洞穴的相机只摆位置和目标，会原样继承那个倾角。
    if (!surfaceCameraOwned(this.surfaceStage) && !this.camera.upVector.equals(Vector3.UpReadOnly)) {
      this.camera.upVector = Vector3.Up()
    }
    // 近裁剪面同样归地表所有：宇宙的 0.1 会把小行星的整个可见地面裁掉（画布全黑）。
    const owned = surfaceCameraOwned(this.surfaceStage)
    this.camera.minZ = owned && this.surfacePose
      ? surfaceNearPlane(this.surfacePose.eyeHeight)
      : UNIVERSE_CAMERA_MIN_Z
    // 最近机位下限也一样：ArcRotateCamera 每帧把 radius 夹回 ≥1.2，地表相机根本
    // 贴不到地面，只能悬在半径 0.18 的星球外一米多，连天空球都在身后。
    this.camera.lowerRadiusLimit = owned ? null : UNIVERSE_LOWER_RADIUS_LIMIT
    this.applyCameraViewport()
    this.syncCameraControl()
  }

  private disposeSurfaceWorld(): void {
    this.surfaceWorld?.dispose()
    this.surfaceWorld = null
    this.surfaceSky?.dispose()
    this.surfaceSky = null
    this.surfaceGround?.dispose()
    this.surfaceGround = null
    this.surfaceMarks?.dispose()
    this.surfaceMarks = null
    this.surfaceBeacons?.dispose()
    this.surfaceBeacons = null
    this.surfaceTrail?.dispose()
    this.surfaceTrail = null
    this.surfaceSignpost = null
    this.surfaceSun?.dispose()
    this.surfaceSun = null
    this.surfaceAmbient?.dispose()
    this.surfaceAmbient = null
    this.surfaceRoot?.dispose(false, false)
    this.surfaceRoot = null
    this.surfacePose = null
    this.surfaceField = null
  }

  /** 每帧驱动地表：块的增删、天空、相机。 */
  private updatePlanetSurface(): void {
    const pose = this.surfacePose
    const field = this.surfaceField
    if (!pose || !field || !surfaceWorldVisible(this.surfaceStage)) return
    const root = this.surfaceRoot
    if (!root) return
    const frame = surfaceFrame(pose, field, this.surfaceRadius, this.surfaceDisplacement)
    const standingRadius = Math.hypot(frame.position[0], frame.position[1], frame.position[2])
    // cameraRadius 是**行星半径的倍数**，不是世界距离 —— 分块 LOD 按它判角直径。
    // 按相机的**真实高度**选块，而不是按落点：俯冲还在高空时不该先建好地面级细节，
    // 那正是一次性 303 块的来源。高处只选到粗块，随着下降逐级补细。
    const cameraAltitude = Vector3.Distance(this.camera.globalPosition, root.position)
      / Math.max(1e-6, this.surfaceRadius)
    const lodRadius = Math.max(standingRadius / Math.max(1e-6, this.surfaceRadius), cameraAltitude)
    this.surfaceWorld?.update(pose.direction, lodRadius)
    const landed = new Vector3(
      root.position.x + frame.position[0],
      root.position.y + frame.position[1],
      root.position.z + frame.position[2],
    )
    const landedTarget = new Vector3(
      root.position.x + frame.target[0],
      root.position.y + frame.target[1],
      root.position.z + frame.target[2],
    )

    // 俯冲：从进入时的机位插值到站立机位。
    //
    // 这里**不能**用墙钟。实测进入那一帧曾长达 2086.5ms（其余帧 <= 14.2ms），墙钟在卡顿
    // 期间照走，卡完之后 8 次渲染就把 1100ms 放完 —— 观感是「卡一下，然后直接切过去」。
    // 改成按帧推进，并且等地表当前 LOD 建够才起步：没东西可看的时候不空跑动画。
    const descent = this.surfaceDescent
    if (descent && this.surfaceStage.phase === 'descending') {
      const worldReady = this.surfaceWorld?.diagnostics().ready ?? true
      this.descentClock = advanceDescent(this.descentClock, {
        frameDeltaMs: this.lastFrameDeltaMs,
        worldReady,
        totalMs: SURFACE_DESCENT_MS,
        reducedMotion: this.reducedMotion,
      })
      const progress = descentProgress(this.descentClock, SURFACE_DESCENT_MS, this.reducedMotion)
      const eased = descentEase(progress)
      this.camera.setPosition(Vector3.Lerp(descent.from, landed, eased))
      this.camera.setTarget(Vector3.Lerp(descent.fromTarget, landedTarget, eased))
      // upVector 必须整体赋值：ArcRotateCamera 的 setter 会重建 _upToYMatrix 缓存，
      // 原地 .set() 绕过 setter，缓存保持 undefined，真引擎上抛
      // "Cannot read properties of undefined (reading 'm')" 并整页掉进文本降级。
      this.camera.upVector = new Vector3(frame.up[0], frame.up[1], frame.up[2])
      this.surfaceStage = advanceSurfaceStage(this.surfaceStage, {
        kind: 'descend', token: this.surfaceStage.token, progress,
      })
      if (progress >= 1) {
        this.surfaceStage = advanceSurfaceStage(this.surfaceStage, {
          kind: 'landed', token: this.surfaceStage.token,
        })
        this.surfaceDescent = null
      }
    } else {
      this.camera.upVector = new Vector3(frame.up[0], frame.up[1], frame.up[2])
      this.camera.setTarget(landedTarget)
      this.camera.setPosition(landed)
    }
    const sun = this.surfaceSunDirection()
    this.surfaceSky?.setSun(sun)
    this.surfaceGround?.setSun(sun)
    const eye = this.camera.globalPosition
    this.surfaceGround?.setCamera([eye.x, eye.y, eye.z], [root.position.x, root.position.y, root.position.z], this.surfaceRadius)
    this.surfaceSun?.direction.set(-sun[0], -sun[1], -sun[2])
    this.surfaceAmbient?.direction.set(frame.up[0], frame.up[1], frame.up[2])
  }

  /** 恒星相对这颗行星的方向，用来给天空定太阳位置。 */
  private surfaceSunDirection(): readonly [number, number, number] {
    const root = this.surfaceRoot
    if (!root || !this.focusedStar) return [0, 1, 0]
    const star = this.currentStarPosition(this.focusedStar)
    const dx = star.x - root.position.x
    const dy = star.y - root.position.y
    const dz = star.z - root.position.z
    const length = Math.hypot(dx, dy, dz)
    return length > 1e-6 ? [dx / length, dy / length, dz / length] : [0, 1, 0]
  }

  private setUniverseVisible(visible: boolean): void {
    if (this.destroyed) return
    this.universeVisible = visible
    this.universeRoot.setEnabled(visible)
    // 地层退场完成：若是从地表挖下去的，此刻回到地表（地表世界重新在场、相机归还）。
    if (visible && this.surfaceStage.phase === 'digging') {
      this.surfaceStage = advanceSurfaceStage(this.surfaceStage, {
        kind: 'surfaced', token: this.surfaceStage.token,
      })
      this.applySurfaceVisibility()
    }
    this.caveRoot?.setEnabled(!visible)
    this.scene.fogEnabled = !visible
    this.syncCameraControl()
    if (visible && this.selectedVisual && this.planetFocusController.state === 'idle') {
      const framing = this.selected ? this.planetFraming(this.selected) : null
      this.planetFocusController.enter(
        this.selectedVisual.visual, framing?.distance,
        framing ? { low: framing.low, high: framing.high } : undefined,
      )
    }
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
    const selectedPosition = this.selectedVisual?.visual.activeMesh.position.clone() ?? startTarget
    const endTarget = phase === 'surface-approach'
      ? selectedPosition
      : phase === 'exit' ? new Vector3(0, -0.35, 1) : new Vector3(0, -1, 1)
    // 行程按**行星实际世界半径**定，不用 descriptor.radius —— 后者与相机半径
    // 不是一套单位（实测行星焦点相机在 1.2，而 descriptor.radius 是 1.4），
    // 拿它算终点会得到 1.200 → 1.148 的 4% 位移：代码在动，眼睛看不出在动。
    const planetRadius = this.selectedPlanetWorldRadius()
    const endRadius = phase === 'surface-approach'
      // 俯冲到贴着大气层外沿，把行星压满画面。
      ? Math.min(startRadius, Math.max(planetRadius * 1.9, planetRadius + 0.05))
      // 穿过表面进到内部 —— 这一段的终点是过程量，落地姿态由 finishEntry 覆盖。
      : phase === 'exit' ? 0.9 : Math.max(0.05, planetRadius * 0.25)
    const duration = this.reducedMotion ? 0 : phase === 'surface-approach' ? 900 : 700
    const startedAt = performance.now()
    let elapsed = 0
    let cancelled = false
    const observer = this.scene.onBeforeRenderObservable.add(() => {
      if (cancelled || this.destroyed) return
      try {
        const renderedAt = performance.now()
        // 按墙钟推进，不按帧间隔累加：慢硬件上一帧要几百毫秒，逐帧累加会被
        // 50ms 的上限钉住，720ms 的动画实测跑成 2.6 秒还没完。与相机飞行同一套
        // 理由，复用同一个函数（它同时限制单帧跳变，不会因卡顿而瞬移）。
        elapsed = flightElapsedMs(startedAt, renderedAt, duration, elapsed)
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
    this.caveGuideLight = null
    const root = new TransformNode('answer-strata-root', this.scene)
    this.caveRoot = root

    const renderLayers = layout.layers.length > 0
      ? layout.layers
      : [{ id: 'surface-observation-room', centerDepth: 2.5, thickness: 5, colorIndex: 1, openingAngle: null }]
    for (const layer of renderLayers) {
      const wall = CreateCylinder(`cave-wall:${layer.id}`, {
        height: layer.thickness + 0.12,
        diameter: layout.bounds.radius * 2,
        tessellation: 18,
        subdivisions: laminationSubdivisions(layer.thickness + 0.12),
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
      // 相邻层交替明暗：洞窟之所以读得出「层」，靠的就是这个对比。
      material.diffuseColor = new Color3(...layerBaseColor(layer.colorIndex))
      material.emissiveColor = new Color3(...layerEmissive(layer.colorIndex))
      // 层内部的纹层写进顶点色：层厚 4–18 个世界单位、竖井半径只有 4.8，
      // 一屏装不下两层，没有纹层岩壁就是一整块平色。用顶点色而不是纹理，
      // 是因为它不增加任何 draw call，也不会在掠射角上被各向异性糊平。
      wall.useVertexColors = true
      paintLaminations(wall, layer.thickness + 0.12)
      material.specularColor = new Color3(0.045, 0.055, 0.06)
      material.backFaceCulling = false
      material.twoSidedLighting = true
      wall.material = material

      const seam = CreateCylinder(`cave-seam:${layer.id}`, {
        height: SEAM_THICKNESS,
        diameter: layout.bounds.radius * 1.96,
        tessellation: 22,
        cap: CAVE_CYLINDER_CAP === 'none' ? Mesh.NO_CAP : Mesh.CAP_ALL,
      }, this.scene)
      seam.parent = root
      seam.position.y = -(layer.centerDepth + layer.thickness / 2)
      seam.isPickable = false
      const seamMaterial = new StandardMaterial(`${seam.name}:material`, this.scene)
      seamMaterial.diffuseColor = new Color3(0.035, 0.085, 0.10)
      // 层界是年代刻度本身，必须是竖井里最亮的一道线。
      seamMaterial.emissiveColor = new Color3(...SEAM_EMISSIVE)
      seamMaterial.backFaceCulling = false
      seam.material = seamMaterial
    }

    this.createCaveCap(root, layout)
    this.createUndatedRoom(root, layout)
    for (const specimen of layout.specimens) this.createSpecimen(root, specimen)
    this.createCaveDust(root, layout)
    this.createCaveLights(root, layout)
    this.caveMaxDepth = Math.max(1, layout.bounds.maxDepth)
    // 引导光：跟着旅行者下移的一盏冷光。它不负责照明（照明由层内的点光给），
    // 它负责说「上方还有出口」—— 竖井里没有地平线，没有它就没有方向感。
    const guide = strataGuideLight(layout.bounds.minDepth, babylonUpliftTier(this.quality))
    const guideLight = new PointLight('cave-guide', new Vector3(0, guide.y, 0), this.scene)
    guideLight.parent = root
    guideLight.diffuse = new Color3(guide.color[0], guide.color[1], guide.color[2])
    guideLight.specular = new Color3(guide.color[0], guide.color[1], guide.color[2])
    guideLight.intensity = guide.intensity
    guideLight.range = guide.range
    this.caveGuideLight = guideLight
    this.applyStrataDepthAtmosphere(layout.bounds.minDepth)
    this.scene.fogMode = Scene.FOGMODE_EXP2
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

    // 光晕：让一条答案读起来是一个**节点**，不是一块石头。
    // 颜色说出「我写的 / 我收的 / 只是读到过」，与标本本体同一套语义。
    const halo = strataSpecimenHalo({
      scale: specimen.scale, created, collected: specimen.relations.includes('collected'),
    })
    const glow = CreateIcoSphere(`answer-specimen-halo:${specimen.answerId}`, {
      radius: 1, subdivisions: 2,
    }, this.scene)
    glow.parent = mesh
    glow.scaling.setAll(halo.radius)
    glow.isPickable = false
    const glowMaterial = new StandardMaterial(`${glow.name}:material`, this.scene)
    glowMaterial.disableLighting = true
    glowMaterial.backFaceCulling = false
    glowMaterial.alphaMode = ALPHA_ADD_MODE
    glowMaterial.emissiveColor = new Color3(
      halo.color[0] * halo.intensity, halo.color[1] * halo.intensity, halo.color[2] * halo.intensity,
    )
    glowMaterial.alpha = 0.30 + halo.intensity * 0.22
    glow.material = glowMaterial

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
      light.intensity = CAVE_LIGHT_INTENSITY
      // 灯在 ±2.4、竖井半径 4.8：range 9 时对面岩壁几乎收不到光。
      light.range = CAVE_LIGHT_RANGE
    }
  }

  private applyStarFocus(star: StarDatum): boolean {
    try {
      this.diagnosticApproachProgressOverride = null
      this.diagnosticCameraSamples?.splice(0)
      this.clearPlanet()
      this.materializeStarSystem(star)
      this.focusedStar = star
      const starKey = starIdentity(star.s)
      const target = this.currentStarPosition(star)
      this.starLayer.setFocus(starKey, star)
      this.applyLayerFocus(star)
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
        destinationRadius: framing.radius,
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
        this.activeFlight = Object.freeze({ flight: result.flight, elapsedMs: 0, startedAt: performance.now() })
        this.lastFlightDurationMs = result.flight.durationMs
        this.presentation = describeStarPresentation({ phase: 'approach', approachProgress: 0 })
        this.recordDiagnosticCameraSample()
      } else if (result.kind === 'noop') {
        this.activeFlight = null
        this.lastFlightDurationMs = 0
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
      if (this.focusedStar) attemptRecovery(() => this.materializeStarSystem(this.focusedStar as StarDatum))
      else attemptRecovery(() => this.releaseMaterializedPlanets())
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
    const framed = systemDistance(extent.value, this.camera.fov)
    const radius = Math.min(maximum, Math.max(minimum, framed))
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
    this.dust?.setMode(this.mode, this.universe, this.wormIdx)
    this.rings?.setMode(this.mode, this.universe, this.wormIdx)
    this.overlay?.setMode(this.mode, this.universe, this.wormIdx)
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
    return this.reducedMotion || this.diagnosticApproachProgressOverride != null ? 0 : this.elapsedMs
  }

  private cancelFlight(reason: Parameters<CameraFlightController['cancel']>[0]): void {
    this.diagnosticApproachProgressOverride = null
    this.cameraFlightController.cancel(reason)
    this.activeFlight = null
    this.presentation = describeStarPresentation({
      phase: this.selected ? 'planet-focus' : this.focusedStar ? 'star-focus' : 'panorama',
    })
    this.lastPresentationInput = null
  }

  private updateCameraFlight(): void {
    const active = this.activeFlight
    if (!active) return
    const override = this.diagnosticApproachProgressOverride
    const elapsedMs = typeof override === 'number'
      ? active.flight.durationMs * override
      : flightElapsedMs(active.startedAt, performance.now(), active.flight.durationMs, active.elapsedMs)
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
      this.recordDiagnosticCameraSample()
      this.presentation = describeStarPresentation({ phase: 'approach', approachProgress: frame.progress })
      this.activeFlight = frame.complete
        ? null
        : Object.freeze({ flight: active.flight, elapsedMs, startedAt: active.startedAt })
      if (frame.complete) {
        this.diagnosticApproachProgressOverride = null
        this.presentation = describeStarPresentation({ phase: 'star-focus' })
      }
      this.lastPresentationInput = null
      this.syncOrbitPresentation()
    } catch (cause) {
      this.recoverCamera(cause)
    }
  }

  private setDiagnosticApproachProgress(progress: number | null): boolean {
    if (import.meta.env.VITE_E2E_DIAGNOSTICS !== '1') return false
    if (progress === null) {
      const wasFrozen = this.diagnosticApproachProgressOverride !== null
      this.diagnosticApproachProgressOverride = null
      return wasFrozen
    }
    const active = this.activeFlight
    if (!active || !this.focusedStar || !Number.isFinite(progress) || progress < 0 || progress > 1) return false
    const deterministicTarget = starWorldPosition(this.focusedStar, 0, 0, new Vector3())
    const deterministicFlight: CameraFlight = Object.freeze({
      ...active.flight,
      to: Object.freeze({
        target: Object.freeze({
          x: deterministicTarget.x,
          y: deterministicTarget.y,
          z: deterministicTarget.z,
        }),
        radius: active.flight.to.radius,
      }),
    })
    this.elapsedMs = 0
    this.diagnosticApproachProgressOverride = progress
    this.activeFlight = Object.freeze({
      flight: deterministicFlight,
      elapsedMs: deterministicFlight.durationMs * progress,
      startedAt: performance.now() - deterministicFlight.durationMs * progress,
    })
    this.updateCameraFlight()
    return true
  }

  private recordDiagnosticCameraSample(): void {
    if (import.meta.env.VITE_E2E_DIAGNOSTICS !== '1' || !this.diagnosticCameraSamples) return
    this.diagnosticCameraSamples.push({
      sequence: this.diagnosticCameraSequence,
      timestampMs: performance.now(),
      distance: this.camera.radius,
    })
    this.diagnosticCameraSequence += 1
    if (this.diagnosticCameraSamples.length > 180) this.diagnosticCameraSamples.shift()
  }

  private recoverCamera(cause: unknown): void {
    this.diagnosticApproachProgressOverride = null
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
    if (this.selected && this.planetFocusController.state === 'focused') {
      this.planetDragPointerId = event.pointerId
      this.planetDragX = event.clientX
      this.planetDragY = event.clientY
      this.planetDragMovement = 0
      // 判「按在东西上」也要走屏幕空间容差。这里若仍用逐像素的 scene.pick，
      // 瞄着行星差几像素按下、松手位移不足 6px，就会被当成「点了空白」弹回恒星系。
      this.planetDragStartedOnTarget = this.pointerTarget(
        event.clientX, event.clientY, pointerKind(event.pointerType),
      ) !== null
      try { this.canvas.setPointerCapture(event.pointerId) } catch { /* detached canvas */ }
      return
    }
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
    if (this.planetDragPointerId === event.pointerId) {
      const deltaX = event.clientX - this.planetDragX
      const deltaY = event.clientY - this.planetDragY
      this.planetDragMovement += Math.hypot(deltaX, deltaY)
      this.planetFocusController.drag(deltaX, deltaY)
      this.planetDragX = event.clientX
      this.planetDragY = event.clientY
      return
    }
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
    if (this.planetDragPointerId === event.pointerId) {
      this.planetDragPointerId = null
      if (this.canvas.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId)
      if (this.planetDragMovement < 6 && !this.planetDragStartedOnTarget) this.exitHierarchy()
      return
    }
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
    if (this.planetDragPointerId === event.pointerId) this.planetDragPointerId = null
    this.pointerPresentation.pointerCancel(event.pointerId)
    this.applyPointerPresentationFeedback()
  }

  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    if (this.planetDragPointerId === event.pointerId) this.planetDragPointerId = null
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
    if (this.planetFocusController.wheel(event.deltaY)) {
      event.preventDefault()
      return
    }
    // 聚焦行星时已经滚到最远、还在继续外滚 —— 那就是要离开这颗行星。
    // 以前这一步能走通是因为 Babylon 自带的指针缩放也在推半径，把它顶过了退出阈值；
    // 环绕归控制器独占之后就没人推了，得把这个意图写明白。
    if (this.planetFocusController.state === 'focused' && event.deltaY > 0) {
      event.preventDefault()
      this.exitHierarchy()
      return
    }
    const threshold = wheelExitThreshold(this.framingPhase(), {
      sceneRadius: this.sceneRadius,
      systemDistance: this.focusedStar ? this.systemFramingRadius(this.focusedStar) : undefined,
    })
    if (threshold !== null && shouldExitOnWheel(event.deltaY, this.camera.radius, threshold)) {
      this.exitHierarchy()
    }
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    this.applyKeyDown(event)
  }

  private applyKeyDown(event: KeyboardEvent): void {
    // 检查探测器时 Escape 属于那个模态对话框：它只关面板、焦点回到触发按钮，
    // 不该顺手把恒星聚焦一起退掉。对话框的处理器先跑、先把检查关掉，事件才
    // 冒泡到这里 —— 所以还要认「这个按键已经被别人消费过」。
    if (this.destroyed || this.workspaceOpen || this.inspectedProbeId || event.defaultPrevented) return
    if (this.planetFocusController.keyDown(event.key)) {
      event.preventDefault()
      return
    }
    if (event.key === 'Escape') this.exitHierarchy()
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
    const local = {
      x: clientX - rect.left,
      y: clientY - rect.top,
      inputKind,
      viewport: { width: rect.width, height: rect.height },
    }
    const picked = pickProjectedStar(local, candidates)
    if (picked) return `star:${picked.starKey}`
    // 行星过去只走 scene.pick，逐像素打在网格上：球在屏幕上多小可点区域就多小，
    // 瞄准差几像素就被判成「点了空白」，然后被 exitHierarchy 弹回宇宙。
    // 让它享有与恒星同一套屏幕空间容差 —— 近失变命中，而不是变退出。
    const planet = pickProjectedStar(local, this.projectedPlanetCandidates())
    return planet ? `planet:${planet.starKey}` : null
  }

  /** 当前可交互问题行星的屏幕投影，供邻近拾取使用。 */
  private projectedPlanetCandidates(): readonly ProjectedStarCandidate[] {
    if (!this.universeVisible || !this.focusedStar) return []
    const rect = this.canvas.getBoundingClientRect()
    const renderHeight = Math.max(1, this.engine.getRenderHeight())
    const projectionScale = renderHeight * 0.5 / Math.tan(this.camera.fov * 0.5)
    const cameraPosition = this.camera.globalPosition
    const candidates: ProjectedStarCandidate[] = []
    for (const record of this.visualByQuestion.values()) {
      const mesh = record.visual.activeMesh
      if (!mesh.isEnabled() || !mesh.isPickable) continue
      const projected = this.projectToCss(mesh.position)
      if (!(projected.z > 0 && projected.z < 1)) continue
      const distance = Math.max(1e-3, Vector3.Distance(mesh.position, cameraPosition))
      // 用实际的世界半径（含缩放），和 projectedBounds 里的球一致；descriptor.radius
      // 不是相机单位，拿它算出来的容差比屏幕上的球小一圈。
      const radiusPx = record.visual.radius * projectionScale / distance
        * rect.height / renderHeight
      candidates.push({
        starKey: record.datum.question.id,
        x: projected.x,
        y: projected.y,
        depth: projected.z,
        visualRadiusPx: radiusPx,
        visible: true,
        solid: true,
      })
    }
    return candidates
  }

  private sceneTarget(clientX: number, clientY: number): string | null {
    const rect = this.canvas.getBoundingClientRect()
    const x = (clientX - rect.left) * this.engine.getRenderWidth() / Math.max(1, rect.width)
    const y = (clientY - rect.top) * this.engine.getRenderHeight() / Math.max(1, rect.height)
    const mesh = this.scene.pick(x, y)?.pickedMesh
    if (!mesh) return null
    const probePart = this.probeLayer?.pickPart(mesh)
    if (probePart) return `probe-part:${probePart}`
    const specimen = this.specimenByMeshId.get(mesh.uniqueId)
    if (specimen) return `specimen:${specimen.answerId}`
    const visual = this.visualByMeshId.get(mesh.uniqueId)
    return visual && visual.visual.activeMesh.isEnabled() && visual.visual.activeMesh.isPickable
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
    if (target.startsWith('probe-part:')) {
      // 点中机体某一件就把它高亮，并让面板的部件列表跟着选中 —— 画面与 UI
      // 说的是同一件事。
      const part = target.slice(11) as ProbePart
      this.focusProbePart(part)
      this.callbacks.onProbePartChange?.(part)
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
    this.applyPlanetHover(feedback.hoverStarKey)
    if (syncLayer) this.syncStarLayerPresentation()
  }

  /**
   * 行星悬停反馈。
   *
   * 指针目标已经由 `sceneTarget` 拾取过一次（它返回 `planet:<id>`），
   * 所以这里不需要第二次 `scene.pick` —— 只是把已经知道的事实告诉行星。
   * 只有当前恒星系的行星被物化，所以这个循环最多几件。
   */
  private applyPlanetHover(hoverKey: string | null): void {
    const hovered = hoverKey?.startsWith('planet:') ? hoverKey.slice('planet:'.length) : null
    for (const [questionId, record] of this.visualByQuestion) {
      record.visual.setHovered(questionId === hovered)
    }
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
    if (!this.labels) {
      this.labelCanvas.width = Math.max(1, Math.round(rect.width * dpr))
      this.labelCanvas.height = Math.max(1, Math.round(rect.height * dpr))
      return
    }
    this.labels.resize(Math.max(1, rect.width), Math.max(1, rect.height), dpr)
  }

}

function smoothStep(value: number, low: number, high: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / Math.max(1e-6, high - low)))
  return t * t * (3 - 2 * t)
}


function starOwnerKey(star: StarDatum): string {
  return 'id' in star.s ? star.s.id : star.s.c
}

function unsupported(message: string): Error {
  const cause = new Error(message)
  cause.name = 'UnsupportedRendererFeatureError'
  return cause
}

/** 行星在轨道上此刻的位置：恒星位置 + 轨道相位。 */
function orbitPositionOf(datum: PlanetDatum, starPosition: Vector3, orbitTimeMs: number, out: Vector3): Vector3 {
  const angle = datum.phase + Math.PI * 2 / datum.period * (orbitTimeMs / 1000)
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  return out.set(
    starPosition.x + (datum.u[0] * cosine + datum.v[0] * sine) * datum.orbitR,
    starPosition.y + (datum.u[1] * cosine + datum.v[1] * sine) * datum.orbitR,
    starPosition.z + (datum.u[2] * cosine + datum.v[2] * sine) * datum.orbitR,
  )
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
    const selected = selectPlanetData(index, star.s)
    for (const datum of selected) {
      const material = planetMaterialInput(datum, timeline)
      // Three 的轨道编号从 0 起；orbitIndex 是 1 起的展示编号。
      const orbitIndex = datum.orbitIndex - 1
      const orbit = systemOrbit(orbitIndex, selected.length, star.seed)
      const orbitR = orbit.radius
      const plane = orbitPlane(orbitIndex, star.sysU, star.sysV, star.sysAxis)
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
        u: [plane.u[0], plane.u[1], plane.u[2]] as [number, number, number],
        v: [plane.v[0], plane.v[1], plane.v[2]] as [number, number, number],
        orbitR,
        phase: orbit.phase,
        period: orbitPeriodFor(orbitR),
        radius: planetWorldRadius(material.answerDensity) * orbit.bodyScale,
        belt: orbit.belt,
      }))
    }
  }
  return Object.freeze(planets)
}
