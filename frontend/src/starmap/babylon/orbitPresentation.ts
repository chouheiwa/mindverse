import {
  PointerGestureController,
  type PointerDownTransition,
  type PointerGestureSnapshot,
  type PointerMoveTransition,
  type PointerUpTransition,
} from './starPicker'

export type OrbitPhase = 'panorama' | 'approach' | 'star-focus' | 'planet-focus' | 'strata'

export interface OrbitPresentationState {
  readonly phase: OrbitPhase
  readonly focusedOwnerKey?: string
  readonly selectedQuestionId?: string
  readonly systemReveal?: number
}

interface OwnedOrbit extends OrbitPresentationState {
  readonly ownerKey: string
  readonly questionId?: string
}

interface OrbitLinePort {
  alpha: number
  setEnabled(enabled: boolean): void
}

export function applyOrbitLineAlpha(line: OrbitLinePort, alpha: number): void {
  line.alpha = alpha
  line.setEnabled(alpha > 0)
}

/** Macro rings are the faint, panorama-scale structure of a knowledge cluster. */
export function macroOrbitAlpha(state: OwnedOrbit): number {
  if (state.phase === 'strata') return 0
  if (state.phase === 'panorama') return 0.035
  return 0.012
}

/** One median-outer radius communicates a cluster without drawing a wire cage. */
export function selectMacroOrbitRadius(radii: readonly number[]): number | null {
  const eligible = radii.filter((radius) => radius > 1.5).sort((left, right) => left - right)
  if (eligible.length === 0) return null
  return Math.round(eligible[Math.floor(eligible.length * 0.55)])
}

export function selectDominantClusterIds(
  clusters: readonly { readonly g: number; readonly n: number }[],
  limit = 6,
): ReadonlySet<number> {
  return new Set([...clusters]
    .sort((left, right) => right.n - left.n || left.g - right.g)
    .slice(0, Math.max(0, limit))
    .map(({ g }) => g))
}

/** Question paths unfold only after the user enters their parent star system. */
export function questionOrbitAlpha(state: OwnedOrbit): number {
  // planet-focus 是**地表阶段**：轨道椭圆是宇宙家具，回答的是「我在系统的
  // 哪里」，站在地表上时这个问题不成立 —— 画出来就还是轨道视角。
  if (state.phase === 'panorama' || state.phase === 'strata' || state.phase === 'planet-focus') return 0
  if (state.ownerKey !== state.focusedOwnerKey) return 0
  if (state.phase === 'approach') return 0.34 * reveal(state.systemReveal)
  return 0.34
}

export function questionPlanetPresentation(state: OwnedOrbit): Readonly<{
  reveal: number
  visible: boolean
  pickable: boolean
}> {
  const owned = state.phase !== 'panorama'
    && state.phase !== 'strata'
    && state.ownerKey === state.focusedOwnerKey
  const amount = !owned ? 0 : state.phase === 'approach' ? reveal(state.systemReveal) : 1
  return Object.freeze({ reveal: amount, visible: amount > 0, pickable: amount >= 0.05 })
}

export function questionPlanetVisible(state: OwnedOrbit): boolean {
  return questionPlanetPresentation(state).visible
}

function reveal(value: number | undefined): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value as number)) : 0
}

export interface StellarPointerPresentationSnapshot {
  readonly hoverStarKey: string | null
  readonly pressedStarKey: string | null
  readonly cursor: '' | 'pointer'
}

type PointerMovePresentation = PointerMoveTransition & { readonly starKey: string | null }

const EMPTY_POINTER_PRESENTATION: StellarPointerPresentationSnapshot = Object.freeze({
  hoverStarKey: null,
  pressedStarKey: null,
  cursor: '',
})

/** Keeps visual feedback derived from the gesture's validated state. */
export class StellarPointerPresentationController {
  private gesture = new PointerGestureController()
  private feedback: StellarPointerPresentationSnapshot = EMPTY_POINTER_PRESENTATION

  snapshot(): StellarPointerPresentationSnapshot { return this.feedback }
  gestureSnapshot(): PointerGestureSnapshot { return this.gesture.snapshot() }

  pointerDown(event: PointerDownTransition): void {
    this.gesture.pointerDown(event)
    this.feedback = Object.freeze({
      hoverStarKey: null,
      pressedStarKey: visualStarKey(this.gesture.snapshot().pressedStarKey),
      cursor: '',
    })
  }

  pointerMove(event: PointerMovePresentation): void {
    this.gesture.pointerMove(event)
    const gesture = this.gesture.snapshot()
    if (gesture.activePointerId !== null || gesture.multiPointerInvalidated) {
      this.feedback = Object.freeze({
        hoverStarKey: null,
        pressedStarKey: visualStarKey(gesture.pressedStarKey),
        cursor: '',
      })
      return
    }
    this.feedback = Object.freeze({
      hoverStarKey: visualStarKey(event.starKey),
      pressedStarKey: null,
      cursor: event.starKey ? 'pointer' : '',
    })
  }

  pointerUp(event: PointerUpTransition): string | null {
    const chosen = this.gesture.pointerUp(event)
    this.feedback = EMPTY_POINTER_PRESENTATION
    return chosen
  }

  pointerCancel(pointerId: number): void {
    this.gesture.pointerCancel(pointerId)
    this.feedback = EMPTY_POINTER_PRESENTATION
  }

  lostPointerCapture(pointerId: number): void {
    this.gesture.lostPointerCapture(pointerId)
    this.feedback = EMPTY_POINTER_PRESENTATION
  }

  pointerLeave(): void {
    const gesture = this.gesture.snapshot()
    if (gesture.activePointerId !== null || gesture.multiPointerInvalidated) return
    this.feedback = EMPTY_POINTER_PRESENTATION
  }

  clear(): void {
    this.gesture = new PointerGestureController()
    this.feedback = EMPTY_POINTER_PRESENTATION
  }
}

function visualStarKey(target: string | null): string | null {
  return target?.startsWith('star:') ? target.slice(5) : null
}
