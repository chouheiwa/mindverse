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
  readonly onStrataPhase?: (event: {
    token: StrataToken
    questionId: string
    phase: StrataPhase
  }) => void
  readonly onStrataExited?: (event: { token: StrataToken; questionId: string }) => void
  readonly onStrataPose?: (event: { questionId: string; pose: StrataPose }) => void
  readonly onAnswerSpecimenFocus?: (event: {
    questionId: string
    answerId: string
    pose: StrataPose
  }) => void
  readonly onStrataError?: (event: {
    token: StrataToken
    questionId: string
    cause: Error
  }) => void
}

export interface MindverseRenderer {
  start(): void
  stop(): void
  suspend(now?: number): void
  resume(now?: number): void
  resize(): void
  destroy(): void
  setMode(mode: Mode, wormIdx?: number): void
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
  enterStrata(request: StrataRequest): void
  moveStrata(input: StrataMoveIntent): void
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
