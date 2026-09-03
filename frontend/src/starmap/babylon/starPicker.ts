import type { StarDatum } from '../gl/starData'
import { starWorldPosition } from '../gl/starData'
import { starIdentity } from '../starIdentity'
import { describeStarVisual, type StarVisualDescriptor } from './starVisualDescriptor'

export type PointerInputKind = 'mouse' | 'touch' | 'pen'

export interface ProjectedStarCandidate {
  readonly starKey: string
  readonly x: number
  readonly y: number
  /** Normalized device depth: zero is near and one is far. */
  readonly depth: number
  readonly visualRadiusPx: number
  readonly visible: boolean
}

export interface StarPickInput {
  readonly x: number
  readonly y: number
  readonly inputKind: PointerInputKind
  readonly viewport: {
    readonly width: number
    readonly height: number
  }
  readonly capturedByHigherPriority?: boolean
}

export function pickProjectedStar(
  input: StarPickInput,
  candidates: readonly ProjectedStarCandidate[],
): ProjectedStarCandidate | null {
  if (input.capturedByHigherPriority) return null

  const isMouse = input.inputKind === 'mouse'
  const minimumRadius = isMouse ? 10 : 22
  const maximumRadius = isMouse ? 28 : 36
  let winner: ProjectedStarCandidate | null = null
  let winnerDistanceSquared = Number.POSITIVE_INFINITY

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]
    if (!candidate) continue
    if (!isPickable(candidate, input.viewport.width, input.viewport.height)) continue
    const radius = clamp(candidate.visualRadiusPx, minimumRadius, maximumRadius)
    const dx = input.x - candidate.x
    const dy = input.y - candidate.y
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared > radius * radius) continue
    if (!winner
      || distanceSquared < winnerDistanceSquared
      || (distanceSquared === winnerDistanceSquared && precedesAtEqualDistance(candidate, winner))) {
      winner = candidate
      winnerDistanceSquared = distanceSquared
    }
  }
  return winner
}

function precedesAtEqualDistance(candidate: ProjectedStarCandidate, winner: ProjectedStarCandidate): boolean {
  if (candidate.depth !== winner.depth) return candidate.depth < winner.depth
  return compareCodeUnits(candidate.starKey, winner.starKey) < 0
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function isPickable(candidate: ProjectedStarCandidate, width: number, height: number): boolean {
  return candidate.visible
    && Number.isFinite(candidate.x)
    && Number.isFinite(candidate.y)
    && Number.isFinite(candidate.depth)
    && Number.isFinite(candidate.visualRadiusPx)
    && candidate.x >= 0
    && candidate.x <= width
    && candidate.y >= 0
    && candidate.y <= height
    && candidate.depth >= 0
    && candidate.depth <= 1
}

export interface WorldPosition {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface ProjectedPosition {
  readonly x: number
  readonly y: number
  readonly depth: number
  readonly visible: boolean
}

export type StarProjector = (
  world: WorldPosition,
  datum: StarDatum,
  visual: StarVisualDescriptor,
) => ProjectedPosition

interface PreparedStar {
  readonly datum: StarDatum
  readonly starKey: string
  readonly visual: StarVisualDescriptor
}

interface MutableProjectedStarCandidate {
  readonly starKey: string
  x: number
  y: number
  depth: number
  readonly visualRadiusPx: number
  visible: boolean
}

export class ProjectedStarCandidateBuffer {
  private readonly prepared: readonly PreparedStar[]
  private readonly candidates: MutableProjectedStarCandidate[]
  private readonly world = mutableWorldPosition()

  constructor(stars: readonly StarDatum[]) {
    this.prepared = stars.map((datum) => ({
      datum,
      starKey: starIdentity(datum.s),
      visual: describeStarVisual(datum),
    }))
    this.candidates = this.prepared.map(({ starKey, visual }) => ({
      starKey,
      x: 0,
      y: 0,
      depth: 0,
      visualRadiusPx: visual.panoramaHaloPx,
      visible: false,
    }))
  }

  /**
   * Updates retained storage in place. The returned array, its candidate objects,
   * and the world-position object passed to `project` are reused and mutated by
   * later updates; callers that retain a snapshot must copy the values they need.
   */
  update(
    elapsedMs: number,
    bobAmplitude: number,
    project: StarProjector,
  ): readonly ProjectedStarCandidate[] {
    for (let index = 0; index < this.prepared.length; index += 1) {
      const prepared = this.prepared[index]
      const candidate = this.candidates[index]
      if (!prepared || !candidate) continue
      starWorldPosition(prepared.datum, elapsedMs, bobAmplitude, this.world)
      const projected = project(this.world, prepared.datum, prepared.visual)
      candidate.x = projected.x
      candidate.y = projected.y
      candidate.depth = projected.depth
      candidate.visible = projected.visible
    }
    return this.candidates
  }
}

export function buildProjectedStarCandidates(
  stars: readonly StarDatum[],
  elapsedMs: number,
  bobAmplitude: number,
  project: StarProjector,
): ProjectedStarCandidate[] {
  return [...new ProjectedStarCandidateBuffer(stars).update(elapsedMs, bobAmplitude, project)]
}

function mutableWorldPosition() {
  return {
    x: 0,
    y: 0,
    z: 0,
    set(x: number, y: number, z: number) {
      this.x = x
      this.y = y
      this.z = z
      return this
    },
  }
}

interface GesturePoint {
  readonly x: number
  readonly y: number
}

export interface PointerDownTransition extends GesturePoint {
  readonly pointerId: number
  readonly inputKind: PointerInputKind
  readonly starKey: string | null
}

export interface PointerMoveTransition extends GesturePoint {
  readonly pointerId: number
}

export interface PointerUpTransition extends GesturePoint {
  readonly pointerId: number
  readonly starKey: string | null
}

export interface PointerGestureSnapshot {
  readonly activePointerId: number | null
  readonly inputKind: PointerInputKind | null
  readonly origin: GesturePoint | null
  readonly lastPoint: GesturePoint | null
  readonly accumulatedMovement: number
  readonly pressedStarKey: string | null
  readonly cancelled: boolean
  readonly multiPointerInvalidated: boolean
}

const EMPTY_GESTURE: PointerGestureSnapshot = {
  activePointerId: null,
  inputKind: null,
  origin: null,
  lastPoint: null,
  accumulatedMovement: 0,
  pressedStarKey: null,
  cancelled: false,
  multiPointerInvalidated: false,
}

export class PointerGestureController {
  private state: PointerGestureSnapshot = EMPTY_GESTURE
  private readonly downPointerIds = new Set<number>()

  snapshot(): PointerGestureSnapshot {
    return this.state
  }

  pointerDown(event: PointerDownTransition): void {
    if (this.downPointerIds.has(event.pointerId)) return
    if (this.downPointerIds.size > 0) {
      this.downPointerIds.add(event.pointerId)
      this.invalidateForMultiplePointers()
      return
    }
    this.downPointerIds.add(event.pointerId)
    const point = { x: event.x, y: event.y }
    this.state = {
      activePointerId: event.pointerId,
      inputKind: event.inputKind,
      origin: point,
      lastPoint: point,
      accumulatedMovement: 0,
      pressedStarKey: event.starKey,
      cancelled: false,
      multiPointerInvalidated: false,
    }
  }

  pointerMove(event: PointerMoveTransition): void {
    if (event.pointerId !== this.state.activePointerId || !this.state.lastPoint) return
    this.addMovement(event)
  }

  pointerUp(event: PointerUpTransition): string | null {
    if (!this.downPointerIds.has(event.pointerId)) return null
    let clickedStarKey: string | null = null
    if (event.pointerId === this.state.activePointerId && this.state.lastPoint) {
      this.addMovement(event)
      clickedStarKey = this.downPointerIds.size === 1
        && !this.state.cancelled
        && !this.state.multiPointerInvalidated
        && this.state.accumulatedMovement < 6
        && this.state.pressedStarKey !== null
        && event.starKey === this.state.pressedStarKey
        ? this.state.pressedStarKey
        : null
    }
    this.finishPointer(event.pointerId)
    return clickedStarKey
  }

  pointerCancel(pointerId: number): void {
    this.cancel(pointerId)
  }

  lostPointerCapture(pointerId: number): void {
    this.cancel(pointerId)
  }

  private addMovement(point: GesturePoint): void {
    const last = this.state.lastPoint
    if (!last) return
    this.state = {
      ...this.state,
      lastPoint: { x: point.x, y: point.y },
      accumulatedMovement: this.state.accumulatedMovement
        + Math.abs(point.x - last.x)
        + Math.abs(point.y - last.y),
    }
  }

  private cancel(pointerId: number): void {
    if (this.downPointerIds.has(pointerId)) this.finishPointer(pointerId)
  }

  private invalidateForMultiplePointers(): void {
    this.state = {
      ...this.state,
      pressedStarKey: null,
      cancelled: true,
      multiPointerInvalidated: true,
    }
  }

  private finishPointer(pointerId: number): void {
    const primaryEnded = pointerId === this.state.activePointerId
    this.downPointerIds.delete(pointerId)
    if (this.downPointerIds.size === 0) {
      this.reset()
      return
    }
    this.state = {
      ...this.state,
      activePointerId: primaryEnded ? null : this.state.activePointerId,
      inputKind: primaryEnded ? null : this.state.inputKind,
      origin: primaryEnded ? null : this.state.origin,
      lastPoint: primaryEnded ? null : this.state.lastPoint,
      pressedStarKey: null,
      cancelled: true,
      multiPointerInvalidated: true,
    }
  }

  private reset(): void {
    this.state = EMPTY_GESTURE
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
