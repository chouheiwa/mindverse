export interface InspectionPose {
  yaw: number
  pitch: number
  distance: number
  panX: number
  panY: number
}

export interface NormalizedPointer {
  readonly id: number
  readonly x: number
  readonly y: number
  /** 0 = primary rotation, 2 = secondary pan. */
  readonly button: 0 | 2
}

/**
 * Platform-neutral snapshot consumed by the inspection controller.
 *
 * `pointers` is the complete active-pointer set after the event. A cancelled or
 * lost capture deliberately has no movement semantics; it only drops history.
 */
export type NormalizedPointerGesture =
  | { readonly type: 'start' | 'move'; readonly pointers: readonly NormalizedPointer[] }
  | { readonly type: 'end' | 'cancel' | 'lost'; readonly pointers?: readonly NormalizedPointer[] }

export const STANDARD_INSPECTION_POSE: Readonly<InspectionPose> = Object.freeze({
  yaw: 0.42,
  pitch: -0.16,
  distance: 3.2,
  panX: 0,
  panY: 0,
})

const MIN_PITCH = -1.2
const MAX_PITCH = 1.2
const MIN_DISTANCE = 1.25
const MAX_DISTANCE = 8
const MAX_PAN_RADIUS = 1.2
const ROTATE_PER_PIXEL = 0.006
const PAN_PER_PIXEL = 0.004
const ZOOM_PER_PIXEL = 0.0025

export function normalizeInspectionPose(pose: Readonly<InspectionPose>): InspectionPose {
  const yaw = finiteYaw(pose.yaw)
  const pitch = clamp(finiteOr(pose.pitch, STANDARD_INSPECTION_POSE.pitch), MIN_PITCH, MAX_PITCH)
  const distance = clamp(finiteOr(pose.distance, STANDARD_INSPECTION_POSE.distance), MIN_DISTANCE, MAX_DISTANCE)
  let panX = finiteOr(pose.panX, STANDARD_INSPECTION_POSE.panX)
  let panY = finiteOr(pose.panY, STANDARD_INSPECTION_POSE.panY)
  const radius = Math.hypot(panX, panY)
  if (radius > MAX_PAN_RADIUS) {
    const scale = (MAX_PAN_RADIUS - Number.EPSILON) / radius
    panX *= scale
    panY *= scale
  }
  return { yaw, pitch, distance, panX, panY }
}

interface PointerSnapshot {
  readonly pointers: readonly NormalizedPointer[]
  readonly centroidX: number
  readonly centroidY: number
  readonly span: number
}

/** Pure, business-state-free camera input controller for a nearby probe. */
export class ProbeInspectionController {
  private pose: InspectionPose = copyPose(STANDARD_INSPECTION_POSE)
  private previousPointers: PointerSnapshot | null = null
  private destroyed = false

  rotate(dx: number, dy: number): InspectionPose {
    if (this.destroyed || !Number.isFinite(dx) || !Number.isFinite(dy)) return this.current()
    this.pose.yaw = finiteYaw(this.pose.yaw + dx * ROTATE_PER_PIXEL)
    this.pose.pitch = clamp(this.pose.pitch + dy * ROTATE_PER_PIXEL, MIN_PITCH, MAX_PITCH)
    return this.current()
  }

  zoom(delta: number): InspectionPose {
    if (this.destroyed || !Number.isFinite(delta)) return this.current()
    const scale = Math.exp(clamp(delta * ZOOM_PER_PIXEL, -20, 20))
    this.pose.distance = clamp(this.pose.distance * scale, MIN_DISTANCE, MAX_DISTANCE)
    return this.current()
  }

  pan(dx: number, dy: number): InspectionPose {
    if (this.destroyed || !Number.isFinite(dx) || !Number.isFinite(dy)) return this.current()
    const x = this.pose.panX + dx * PAN_PER_PIXEL
    const y = this.pose.panY - dy * PAN_PER_PIXEL
    const radius = Math.hypot(x, y)
    const scale = radius > MAX_PAN_RADIUS ? (MAX_PAN_RADIUS - Number.EPSILON) / radius : 1
    this.pose.panX = x * scale
    this.pose.panY = y * scale
    return this.current()
  }

  pointer(event: NormalizedPointerGesture): InspectionPose {
    if (this.destroyed) return this.current()
    if (event.type === 'end' || event.type === 'cancel' || event.type === 'lost') {
      this.previousPointers = null
      return this.current()
    }

    const next = pointerSnapshot(event.pointers ?? [])
    if (!next) {
      this.previousPointers = null
      return this.current()
    }
    if (event.type === 'start' || !this.previousPointers
      || this.previousPointers.pointers.length !== next.pointers.length) {
      this.previousPointers = next
      return this.current()
    }

    const previous = this.previousPointers
    this.previousPointers = next
    const dx = next.centroidX - previous.centroidX
    const dy = next.centroidY - previous.centroidY
    if (next.pointers.length >= 2) {
      this.zoom(previous.span - next.span)
      return this.pan(dx, dy)
    }
    if (next.pointers[0].button === 2) return this.pan(dx, dy)
    return this.rotate(dx, dy)
  }

  keyboard(key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | '+' | '-'): InspectionPose {
    if (this.destroyed) return this.current()
    switch (key) {
      case 'ArrowUp': return this.rotate(0, -12)
      case 'ArrowDown': return this.rotate(0, 12)
      case 'ArrowLeft': return this.rotate(-12, 0)
      case 'ArrowRight': return this.rotate(12, 0)
      case '+': return this.zoom(-60)
      case '-': return this.zoom(60)
    }
  }

  reset(): InspectionPose {
    if (this.destroyed) return this.current()
    this.pose = copyPose(STANDARD_INSPECTION_POSE)
    this.previousPointers = null
    return this.current()
  }

  destroy(): void {
    this.destroyed = true
    this.previousPointers = null
  }

  private current(): InspectionPose {
    return copyPose(this.pose)
  }
}

function pointerSnapshot(pointers: readonly NormalizedPointer[]): PointerSnapshot | null {
  if (pointers.length === 0) return null
  const valid = pointers
    .filter(({ id, x, y, button }) => Number.isFinite(id) && Number.isFinite(x) && Number.isFinite(y)
      && (button === 0 || button === 2))
    .sort((a, b) => a.id - b.id)
  if (valid.length !== pointers.length) return null
  let centroidX = 0
  let centroidY = 0
  for (const pointer of valid) {
    centroidX += pointer.x
    centroidY += pointer.y
  }
  centroidX /= valid.length
  centroidY /= valid.length
  const span = valid.length < 2
    ? 0
    : Math.hypot(valid[0].x - valid[1].x, valid[0].y - valid[1].y)
  return { pointers: valid, centroidX, centroidY, span }
}

function copyPose(pose: Readonly<InspectionPose>): InspectionPose {
  return { ...pose }
}

function finiteYaw(yaw: number): number {
  if (!Number.isFinite(yaw)) return STANDARD_INSPECTION_POSE.yaw
  if (yaw >= -Math.PI && yaw <= Math.PI) return yaw
  const turn = Math.PI * 2
  return ((yaw + Math.PI) % turn + turn) % turn - Math.PI
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}
