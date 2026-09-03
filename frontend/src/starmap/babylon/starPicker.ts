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

  const [minimumRadius, maximumRadius] = input.inputKind === 'mouse'
    ? [10, 28]
    : [22, 36]

  const hits = candidates.flatMap((candidate) => {
    if (!isPickable(candidate, input.viewport.width, input.viewport.height)) return []
    const radius = clamp(candidate.visualRadiusPx, minimumRadius, maximumRadius)
    const dx = input.x - candidate.x
    const dy = input.y - candidate.y
    const distanceSquared = dx * dx + dy * dy
    return distanceSquared <= radius * radius ? [{ candidate, distanceSquared }] : []
  })

  hits.sort((a, b) =>
    a.distanceSquared - b.distanceSquared
    || a.candidate.depth - b.candidate.depth
    || a.candidate.starKey.localeCompare(b.candidate.starKey),
  )
  return hits[0]?.candidate ?? null
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

export function buildProjectedStarCandidates(
  stars: readonly StarDatum[],
  elapsedMs: number,
  bobAmplitude: number,
  project: StarProjector,
): ProjectedStarCandidate[] {
  return stars.map((datum) => {
    const world = starWorldPosition(datum, elapsedMs, bobAmplitude, mutableWorldPosition())
    const visual = describeStarVisual(datum)
    const projected = project(world, datum, visual)
    return {
      starKey: starIdentity(datum.s),
      x: projected.x,
      y: projected.y,
      depth: projected.depth,
      visualRadiusPx: visual.panoramaHaloPx,
      visible: projected.visible,
    }
  })
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

  snapshot(): PointerGestureSnapshot {
    return this.state
  }

  pointerDown(event: PointerDownTransition): void {
    if (this.state.activePointerId !== null) {
      if (event.pointerId !== this.state.activePointerId) {
        this.state = {
          ...this.state,
          pressedStarKey: null,
          cancelled: true,
          multiPointerInvalidated: true,
        }
      }
      return
    }
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
    if (event.pointerId !== this.state.activePointerId || !this.state.lastPoint) return null
    this.addMovement(event)
    const clickedStarKey = !this.state.cancelled
      && !this.state.multiPointerInvalidated
      && this.state.accumulatedMovement < 6
      && this.state.pressedStarKey !== null
      && event.starKey === this.state.pressedStarKey
      ? this.state.pressedStarKey
      : null
    this.reset()
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
    if (pointerId === this.state.activePointerId) this.reset()
  }

  private reset(): void {
    this.state = EMPTY_GESTURE
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
