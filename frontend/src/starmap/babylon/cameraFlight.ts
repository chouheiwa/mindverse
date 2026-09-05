export interface Vector3Like {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface CameraPose {
  readonly target: Vector3Like
  readonly radius: number
}

export interface PlanetExtent {
  readonly orbitR: number
  readonly radius: number
}

export interface CameraFlightInput {
  readonly token: number
  readonly starKey: string
  readonly start: CameraPose
  readonly targetStar: Vector3Like
  readonly bodyR: number
  readonly systemExtent: number
  /**
   * 调用方框好的落点半径（见 framing.ts）。缺省时退回按 systemExtent 推，
   * 但那条路径会与 systemFraming 各算各的，两边一旦不一致相机就会落在
   * 谁也没选过的位置。
   */
  readonly destinationRadius?: number
  readonly overviewRadius: number
  readonly distance: number
  readonly requestedMs: number
  readonly reducedMotion: boolean
}

export interface CameraFlight {
  readonly token: number
  readonly starKey: string
  readonly from: CameraPose
  readonly to: CameraPose
  readonly durationMs: number
}

export interface CameraFlightFrame extends CameraPose {
  readonly token: number
  readonly progress: number
  readonly complete: boolean
}

export type CameraFlightResult =
  | { readonly ok: true, readonly flight: CameraFlight }
  | { readonly ok: false, readonly error: 'invalid-input' }

export type CameraFrameResult =
  | { readonly ok: true, readonly frame: CameraFlightFrame }
  | { readonly ok: false, readonly error: 'invalid-frame' }

export type ControlledCameraFrameResult = CameraFrameResult
  | { readonly ok: false, readonly error: 'cancelled' | 'stale-token' }

export type NumericResult =
  | { readonly ok: true, readonly value: number }
  | { readonly ok: false, readonly error: 'invalid-input' }

export type CameraFlightCancelReason =
  | 'user'
  | 'reset'
  | 'planet'
  | 'strata'
  | 'suspend'
  | 'destroy'

export type CameraFlightStartInput = Omit<CameraFlightInput, 'token'>

export type CameraFlightStartResult =
  | { readonly kind: 'started', readonly flight: CameraFlight }
  | { readonly kind: 'noop', readonly reason: 'already-focused' }
  | { readonly kind: 'error', readonly error: 'invalid-input' }

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

function finiteVector(value: unknown): value is Vector3Like {
  return isRecord(value)
    && Number.isFinite(value.x)
    && Number.isFinite(value.y)
    && Number.isFinite(value.z)
}

function validPose(value: unknown): value is CameraPose {
  return isRecord(value)
    && finiteVector(value.target)
    && Number.isFinite(value.radius)
    && (value.radius as number) > 0
}

function validFlight(value: unknown): value is CameraFlight {
  return isRecord(value)
    && Number.isSafeInteger(value.token)
    && (value.token as number) >= 0
    && typeof value.starKey === 'string'
    && value.starKey.length > 0
    && Number.isFinite(value.durationMs)
    && (value.durationMs as number) >= 0
    && validPose(value.from)
    && validPose(value.to)
}

function freezeVector(value: Vector3Like): Vector3Like {
  return Object.freeze({ x: value.x, y: value.y, z: value.z })
}

function freezePose(value: CameraPose): CameraPose {
  return Object.freeze({ target: freezeVector(value.target), radius: value.radius })
}

export function cameraFlightDuration(
  distance: number,
  reducedMotion: boolean,
  requestedMs: number,
): NumericResult {
  if (!Number.isFinite(distance)
    || distance < 0
    || !Number.isFinite(requestedMs)
    || requestedMs < 0) {
    return Object.freeze({ ok: false, error: 'invalid-input' })
  }
  const value = reducedMotion
    ? Math.min(120, requestedMs)
    : clamp(900 + Math.log1p(distance) * 90, 900, 1300)
  return Number.isFinite(value)
    ? Object.freeze({ ok: true, value })
    : Object.freeze({ ok: false, error: 'invalid-input' })
}

export function computeSystemExtent(
  bodyR: number,
  planets: readonly PlanetExtent[],
): NumericResult {
  if (!Number.isFinite(bodyR) || bodyR <= 0) {
    return Object.freeze({ ok: false, error: 'invalid-input' })
  }
  if (!Array.isArray(planets)) return Object.freeze({ ok: false, error: 'invalid-input' })
  if (planets.length === 0) {
    const fallback = bodyR * 6
    return Number.isFinite(fallback)
      ? Object.freeze({ ok: true, value: fallback })
      : Object.freeze({ ok: false, error: 'invalid-input' })
  }

  let extent = 0
  for (const planet of planets) {
    if (!isRecord(planet)
      || !Number.isFinite(planet.orbitR)
      || (planet.orbitR as number) < 0
      || !Number.isFinite(planet.radius)
      || (planet.radius as number) < 0) {
      return Object.freeze({ ok: false, error: 'invalid-input' })
    }
    const outerRadius = (planet.orbitR as number) + (planet.radius as number)
    if (!Number.isFinite(outerRadius)) {
      return Object.freeze({ ok: false, error: 'invalid-input' })
    }
    extent = Math.max(extent, outerRadius)
  }
  return Object.freeze({ ok: true, value: extent })
}

function validInput(input: unknown): input is CameraFlightInput {
  return isRecord(input)
    && Number.isSafeInteger(input.token)
    && (input.token as number) >= 0
    && typeof input.starKey === 'string'
    && input.starKey.length > 0
    && validPose(input.start)
    && finiteVector(input.targetStar)
    && Number.isFinite(input.bodyR)
    && (input.bodyR as number) > 0
    && Number.isFinite(input.systemExtent)
    && (input.systemExtent as number) >= 0
    && Number.isFinite(input.overviewRadius)
    && (input.overviewRadius as number) > 0
    && Number.isFinite(input.distance)
    && (input.distance as number) >= 0
    && Number.isFinite(input.requestedMs)
    && (input.requestedMs as number) >= 0
    && typeof input.reducedMotion === 'boolean'
}

export function createCameraFlight(input: CameraFlightInput): CameraFlightResult {
  if (!validInput(input)) return Object.freeze({ ok: false, error: 'invalid-input' })

  const minimumRadius = input.bodyR * 8
  const maximumRadius = input.overviewRadius * 0.72
  const bodyRadius = input.bodyR * 14
  const systemRadius = input.systemExtent * 1.35
  if (![minimumRadius, maximumRadius, bodyRadius, systemRadius].every(Number.isFinite)
    || minimumRadius > maximumRadius) {
    return Object.freeze({ ok: false, error: 'invalid-input' })
  }
  const requested = Number.isFinite(input.destinationRadius) && (input.destinationRadius as number) > 0
    ? input.destinationRadius as number
    : Math.max(bodyRadius, systemRadius)
  const destinationRadius = clamp(requested, minimumRadius, maximumRadius)
  if (!Number.isFinite(destinationRadius) || destinationRadius <= 0) {
    return Object.freeze({ ok: false, error: 'invalid-input' })
  }

  const duration = cameraFlightDuration(input.distance, input.reducedMotion, input.requestedMs)
  if (!duration.ok) return Object.freeze({ ok: false, error: duration.error })

  const flight = Object.freeze({
    token: input.token,
    starKey: input.starKey,
    from: freezePose(input.start),
    to: freezePose({ target: input.targetStar, radius: destinationRadius }),
    durationMs: duration.value,
  })
  return Object.freeze({ ok: true, flight })
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value)
}

export function cameraFlightFrame(flight: CameraFlight, elapsedMs: number): CameraFrameResult {
  if (!Number.isFinite(elapsedMs)
    || !validFlight(flight)) {
    return Object.freeze({ ok: false, error: 'invalid-frame' })
  }

  const clampedProgress = flight.durationMs === 0
    ? 1
    : clamp(elapsedMs / flight.durationMs, 0, 1)
  const eased = smoothstep(clampedProgress)
  const target = clampedProgress === 0
    ? freezeVector(flight.from.target)
    : clampedProgress === 1
      ? freezeVector(flight.to.target)
      : freezeVector({
          x: flight.from.target.x + (flight.to.target.x - flight.from.target.x) * eased,
          y: flight.from.target.y + (flight.to.target.y - flight.from.target.y) * eased,
          z: flight.from.target.z + (flight.to.target.z - flight.from.target.z) * eased,
        })
  const radius = clampedProgress === 0
    ? flight.from.radius
    : clampedProgress === 1
      ? flight.to.radius
      : Math.exp(
          Math.log(flight.from.radius)
            + (Math.log(flight.to.radius) - Math.log(flight.from.radius)) * eased,
        )
  if (!finiteVector(target) || !Number.isFinite(radius)) {
    return Object.freeze({ ok: false, error: 'invalid-frame' })
  }

  return Object.freeze({
    ok: true,
    frame: Object.freeze({
      token: flight.token,
      target,
      radius,
      progress: clampedProgress,
      complete: clampedProgress === 1,
    }),
  })
}

export class CameraFlightController {
  #generation = 0
  #activeToken: number | null = null
  #cancelledToken: number | null = null
  #selectedStarKey: string | null = null

  get selectedStarKey(): string | null {
    return this.#selectedStarKey
  }

  start(input: CameraFlightStartInput): CameraFlightStartResult {
    if (input.starKey === this.#selectedStarKey) {
      return Object.freeze({ kind: 'noop', reason: 'already-focused' })
    }

    const token = this.#generation + 1
    const result = createCameraFlight({ ...input, token })
    if (!result.ok) return Object.freeze({ kind: 'error', error: result.error })

    this.#generation = token
    this.#activeToken = token
    this.#selectedStarKey = input.starKey
    return Object.freeze({ kind: 'started', flight: result.flight })
  }

  cancel(reason: CameraFlightCancelReason): void {
    this.#cancelledToken = this.#activeToken
    this.#generation += 1
    this.#activeToken = null
    if (reason !== 'user') this.#selectedStarKey = null
  }

  isActive(token: number): boolean {
    return token === this.#activeToken
  }

  frame(flight: CameraFlight, elapsedMs: number): ControlledCameraFrameResult {
    if (!validFlight(flight)) return Object.freeze({ ok: false, error: 'invalid-frame' })
    if (flight.token === this.#activeToken) return cameraFlightFrame(flight, elapsedMs)
    if (flight.token === this.#cancelledToken) {
      return Object.freeze({ ok: false, error: 'cancelled' })
    }
    return Object.freeze({ ok: false, error: 'stale-token' })
  }
}

export function exitTarget(
  phase: 'panorama' | 'approach' | 'star-focus' | 'planet-focus' | 'strata',
): 'star-focus' | 'panorama' | null {
  if (phase === 'planet-focus') return 'star-focus'
  if (phase === 'star-focus') return 'panorama'
  return null
}

export function shouldExitOnWheel(
  deltaY: number,
  radius: number,
  threshold: number,
): boolean {
  return Number.isFinite(deltaY)
    && Number.isFinite(radius)
    && Number.isFinite(threshold)
    && deltaY > 0
    && radius > threshold
}
