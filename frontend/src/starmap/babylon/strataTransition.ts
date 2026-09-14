import type {
  RendererCallbacks,
  StrataMoveIntent,
  StrataPhase,
  StrataPose,
  StrataRequest,
  StrataToken,
} from '../rendererContract'
import {
  advanceStrataPose,
  buildCaveLayout,
  closeSpecimenFocus,
  focusSpecimen,
  type CaveLayout,
  type SpecimenFocus,
} from './strataScene'

export type StrataAnimationPhase = StrataPhase | 'exit'

export interface StrataAnimationPort {
  capturePose(): StrataPose
  applyPose(pose: StrataPose): void
  setUniverseVisible(visible: boolean): void
  animate(
    phase: StrataAnimationPhase,
    token: StrataToken,
    complete: () => void,
    fail: (cause: Error) => void,
  ): () => void
}

interface ActiveStrata {
  readonly request: StrataRequest
  readonly layout: CaveLayout
  pose: StrataPose
  focus: SpecimenFocus | null
  phase: StrataPhase | 'exit'
  generation: number
}

export class StrataTransitionController {
  private readonly port: StrataAnimationPort
  private readonly callbacks: RendererCallbacks
  private active: ActiveStrata | null = null
  private cancelAnimation: (() => void) | null = null
  private nextGeneration = 1

  constructor(port: StrataAnimationPort, callbacks: RendererCallbacks = {}) {
    this.port = port
    this.callbacks = callbacks
  }

  get layout(): CaveLayout | null { return this.active?.layout ?? null }
  get pose(): StrataPose | null { return this.active ? copyPose(this.active.pose) : null }
  get token(): StrataToken | null { return this.active?.request.token ?? null }
  get questionId(): string | null { return this.active?.request.questionId ?? null }
  get phase(): StrataAnimationPhase | null { return this.active?.phase ?? null }

  enter(request: StrataRequest): void {
    if (this.active?.request.token === request.token) return
    const preservedEntryPose = this.active?.layout.entryPose ?? null
    this.cancelCurrentAnimation()
    if (preservedEntryPose) {
      this.port.setUniverseVisible(true)
      this.port.applyPose(preservedEntryPose)
    }
    const generation = this.nextGeneration++
    const entryPose = preservedEntryPose ?? this.port.capturePose()
    const layout = buildCaveLayout(request.scene, entryPose)
    const pose = copyPose({ depth: layout.bounds.minDepth, yaw: entryPose.yaw, pitch: entryPose.pitch, snapId: null })
    this.active = { request, layout, pose, focus: null, phase: 'surface-approach', generation }
    this.emitPhase('surface-approach')
    this.runAnimation('surface-approach', generation, () => this.beginCrossing(generation))
  }

  move(intent: StrataMoveIntent, deltaSeconds: number): void {
    const active = this.active
    if (!active || (active.phase !== 'strata-free' && active.phase !== 'strata-snapped') || active.focus) return
    const previousSnap = active.pose.snapId
    active.pose = advanceStrataPose(active.pose, intent, deltaSeconds, active.layout)
    this.port.applyPose(active.pose)
    if (active.pose.snapId !== previousSnap) {
      active.phase = active.pose.snapId ? 'strata-snapped' : 'strata-free'
      this.emitPhase(active.phase)
    }
    this.emitPose()
  }

  focusAnswer(answerId: string): void {
    const active = this.active
    if (!active || (active.phase !== 'strata-free' && active.phase !== 'strata-snapped') || active.focus) return
    const specimen = active.layout.specimens.find((item) => item.answerId === answerId)
    if (!specimen) {
      this.emitError(operationError(`答案标本不存在：${answerId}`), 'operation')
      return
    }
    active.focus = focusSpecimen(active.pose, specimen)
    active.pose = active.focus.pose
    this.port.applyPose(active.pose)
    this.callbacks.onAnswerSpecimenFocus?.({
      token: active.request.token,
      questionId: active.request.questionId,
      answerId,
      pose: copyPose(active.focus.savedPose),
    })
  }

  closeAnswer(): void {
    const active = this.active
    if (!active) return
    const restored = closeSpecimenFocus(active.focus)
    if (!restored) return
    active.focus = null
    active.pose = restored
    this.port.applyPose(restored)
    this.emitPose()
  }

  exit(token: StrataToken): void {
    const active = this.active
    if (!active || active.request.token !== token || active.phase === 'exit') return
    this.cancelCurrentAnimation()
    active.phase = 'exit'
    active.focus = null
    const generation = active.generation
    this.runAnimation('exit', generation, () => {
      const current = this.current(generation)
      if (!current) return
      this.port.setUniverseVisible(true)
      this.port.applyPose(current.layout.entryPose)
      const event = { token: current.request.token, questionId: current.request.questionId }
      this.active = null
      this.cancelAnimation = null
      this.callbacks.onStrataExited?.(event)
    })
  }

  destroy(): void {
    this.cancelCurrentAnimation()
    this.active = null
    this.nextGeneration += 1
  }

  private beginCrossing(generation: number): void {
    const active = this.current(generation)
    if (!active) return
    active.phase = 'surface-crossing'
    this.emitPhase('surface-crossing')
    this.runAnimation('surface-crossing', generation, () => this.finishEntry(generation))
  }

  private finishEntry(generation: number): void {
    const active = this.current(generation)
    if (!active) return
    this.port.setUniverseVisible(false)
    active.phase = 'strata-free'
    const depth = Math.min(1.2, active.layout.bounds.maxDepth)
    // Let the first view explain what can be explored: face a nearby answer crystal.
    // A fixed yaw can point at an empty wall even when answers are present.
    const firstAnswer = active.layout.specimens.filter(({ room }) => room !== 'undated')
      .reduce<(typeof active.layout.specimens)[number] | null>((nearest, item) =>
        !nearest || Math.abs(item.depth - depth) < Math.abs(nearest.depth - depth) ? item : nearest, null)
    active.pose = copyPose({
      depth,
      yaw: firstAnswer ? Math.atan2(firstAnswer.x, firstAnswer.z) : 0,
      pitch: firstAnswer ? Math.atan2(depth - firstAnswer.depth, Math.hypot(firstAnswer.x, firstAnswer.z)) : -0.18,
      snapId: null,
    })
    this.port.applyPose(active.pose)
    const event = { token: active.request.token, questionId: active.request.questionId }
    this.callbacks.onStrataEntered?.(event)
    this.emitPhase('strata-free')
    this.emitPose()
  }

  private runAnimation(phase: StrataAnimationPhase, generation: number, complete: () => void): void {
    const active = this.current(generation)
    if (!active) return
    const token = active.request.token
    this.cancelAnimation = this.port.animate(
      phase,
      token,
      () => {
        if (!this.current(generation)) return
        this.cancelAnimation = null
        complete()
      },
      (cause) => {
        const current = this.current(generation)
        if (!current) return
        this.cancelAnimation = null
        this.emitError(cause, 'transition')
        this.port.setUniverseVisible(true)
        this.port.applyPose(current.layout.entryPose)
        this.active = null
      },
    )
  }

  private current(generation: number): ActiveStrata | null {
    return this.active?.generation === generation ? this.active : null
  }

  private cancelCurrentAnimation(): void {
    this.cancelAnimation?.()
    this.cancelAnimation = null
  }

  private emitPhase(phase: StrataPhase): void {
    const active = this.active
    if (!active) return
    this.callbacks.onStrataPhase?.(phase === 'strata-snapped'
      ? { token: active.request.token, questionId: active.request.questionId, phase, snapId: active.pose.snapId! }
      : { token: active.request.token, questionId: active.request.questionId, phase })
  }

  private emitPose(): void {
    const active = this.active
    if (!active) return
    this.callbacks.onStrataPose?.({ questionId: active.request.questionId, pose: copyPose(active.pose) })
  }

  private emitError(cause: Error, scope: 'transition' | 'operation'): void {
    const active = this.active
    if (!active) return
    this.callbacks.onStrataError?.({
      token: active.request.token,
      questionId: active.request.questionId,
      scope,
      cause,
    })
  }
}

function operationError(message: string): Error {
  const cause = new Error(message)
  cause.name = 'StrataOperationError'
  return cause
}

function copyPose(pose: StrataPose): StrataPose {
  return Object.freeze({ depth: pose.depth, yaw: pose.yaw, pitch: pose.pitch, snapId: pose.snapId })
}
