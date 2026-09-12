import type { UniverseIndex } from '../domain/universe'
import type { StrataSceneModel } from '../domain/strata'
import type { Mode, Star } from '../types'
import type { PlanetDatum } from './gl/bodies'

export type StrataToken = number

export interface StrataPose {
  readonly depth: number
  readonly yaw: number
  readonly pitch: number
  readonly snapId: string | null
}

export type StrataPhase =
  | 'surface-approach'
  | 'surface-crossing'
  | 'strata-free'
  | 'strata-snapped'

type StrataEventBase = {
  readonly token: StrataToken
  readonly questionId: string
}

export type StrataPhaseEvent = StrataEventBase & (
  | { readonly phase: Exclude<StrataPhase, 'strata-snapped'> }
  | { readonly phase: 'strata-snapped'; readonly snapId: string }
)

export type StrataErrorScope = 'transition' | 'operation'

export interface StrataRequest {
  readonly token: StrataToken
  readonly questionId: string
  readonly scene: StrataSceneModel
}

export interface StrataMoveIntent {
  readonly forward: number
  readonly yaw: number
  readonly pitch: number
}

export interface InspectionPose {
  yaw: number
  pitch: number
  distance: number
  panX: number
  panY: number
}

export type ProbePart =
  | 'hull'
  | 'left-wing'
  | 'right-wing'
  | 'beacon'
  | 'antenna'
  | 'thruster'
  | 'left-hinge'
  | 'right-hinge'
  | 'seam'
  | 'scanner-lens'
  | 'light-strip-inner'
  | 'etching'

export interface RendererCallbacks {
  readonly onPick?: (star: Star | null) => void
  readonly onPickPlanet?: (planet: PlanetDatum | null) => void
  readonly onAnchor?: (x: number, y: number, visible: boolean) => void
  readonly onGenesisEnd?: () => void
  readonly onRenderReady?: () => void
  readonly onRenderError?: (cause: Error) => void
  readonly onProbeArrived?: (event: { probeId: string; token: number }) => void
  readonly onProbeScanComplete?: (event: { probeId: string; token: number }) => void
  readonly onProbePartChange?: (part: ProbePart | null) => void
  readonly onProbeError?: (event: { probeId: string; token: number; cause: Error }) => void
  readonly onStrataEntered?: (event: { token: StrataToken; questionId: string }) => void
  readonly onStrataPhase?: (event: StrataPhaseEvent) => void
  readonly onStrataExited?: (event: { token: StrataToken; questionId: string }) => void
  readonly onStrataPose?: (event: { questionId: string; pose: StrataPose }) => void
  readonly onAnswerSpecimenFocus?: (event: {
    token: StrataToken
    questionId: string
    answerId: string
    pose: StrataPose
  }) => void
  readonly onStrataError?: (event: {
    token: StrataToken
    questionId: string
    scope: StrataErrorScope
    cause: Error
  }) => void
}

/** 进入地表时带上的上下文。 */
export interface PlanetSurfaceEntry {
  /** 你在时间上接着看的那个问题：从落点铺一条小径指向它，尽头一块路牌。 */
  readonly nextStation?: Readonly<{ questionId: string; starId: string; title: string; at: number }> | null
}

/** 地表上点到的东西。 */
export type SurfacePick =
  | Readonly<{ kind: 'mark'; answerId: string }>
  | Readonly<{ kind: 'planet'; questionId: string; starId: string }>
  | Readonly<{ kind: 'wormhole'; wormholeIndex: number }>
  | Readonly<{ kind: 'signpost'; questionId: string; starId: string }>

export interface MindverseRenderer {
  start(): void
  stop(): void
  suspend(now?: number): void
  resume(now?: number): void
  resize(): void
  destroy(): void
  setMode(mode: Mode, wormIdx?: number): void
  focusStar(starKey: string): Star | null
  resetView(): void
  clearPlanet(): void
  selectQuestionPlanet(starId: string, questionId: string): PlanetDatum | null
  restoreQuestionPlanet(starId: string, questionId: string): PlanetDatum | null
  setWorkspaceOpen(open: boolean): void
  orbitWorkspace(deltaX: number, deltaY: number): void
  approachProbe(probeId: string, token: number): void
  startProbeScan(probeId: string, token: number): void
  setProbeInspectionPose(pose: InspectionPose): void
  setReducedMotion(reduced: boolean): void
  focusProbePart(part: ProbePart | null): void
  exitProbeInspection(): void
  skipGenesis(): void
  /**
   * 进入可环绕地表。**可选能力**：Three 渲染器没有 CPU 地形，不实现它。
   * 调用方拿不到这个方法时应退回「直接进答案地层」的旧路径，而不是报错。
   */
  enterPlanetSurface?(questionId: string, options?: PlanetSurfaceEntry): boolean
  /** 离开地表回到轨道。俯冲途中也必须能退。 */
  exitPlanetSurface?(): void
  /** 地表行走输入。返回 false 表示当前阶段不接受（俯冲中或下潜中）。 */
  walkPlanetSurface?(input: Readonly<{
    forward: number; strafe: number; turn: number; tilt: number
  }>): boolean
  /** 地表上的点击落在什么上：旗/石堆（一条回答）、天上的邻居行星、虫洞通向的星群；没点中返回 null。 */
  pickPlanetSurface?(clientX: number, clientY: number): SurfacePick | null

  enterStrata(request: StrataRequest): void
  moveStrata(input: StrataMoveIntent): void
  pickStrataAt(clientX: number, clientY: number): void
  focusAnswerSpecimen(answerId: string): void
  closeAnswerSpecimen(): void
  exitStrata(token: StrataToken): void
}

export type RendererFactory = (
  canvas: HTMLCanvasElement,
  labels: HTMLCanvasElement,
  index: UniverseIndex,
  reducedMotion: boolean,
  callbacks?: RendererCallbacks,
) => MindverseRenderer
