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

function finiteVector(value: Vector3Like): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z)
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
): number {
  if (reducedMotion) return Math.min(120, requestedMs)
  return clamp(900 + Math.log1p(distance) * 90, 900, 1300)
}

export function computeSystemExtent(
  bodyR: number,
  planets: readonly PlanetExtent[],
): number {
  if (planets.length === 0) return bodyR * 6

  let extent = 0
  for (const planet of planets) {
    extent = Math.max(extent, planet.orbitR + planet.radius)
  }
  return extent
}

function validInput(input: CameraFlightInput): boolean {
  return Number.isSafeInteger(input.token)
    && input.token >= 0
    && input.starKey.length > 0
    && finiteVector(input.start.target)
    && finiteVector(input.targetStar)
    && Number.isFinite(input.start.radius)
    && input.start.radius > 0
    && Number.isFinite(input.bodyR)
    && input.bodyR > 0
    && Number.isFinite(input.systemExtent)
    && input.systemExtent >= 0
    && Number.isFinite(input.overviewRadius)
    && input.overviewRadius > 0
    && Number.isFinite(input.distance)
    && input.distance >= 0
    && Number.isFinite(input.requestedMs)
    && input.requestedMs >= 0
}

export function createCameraFlight(input: CameraFlightInput): CameraFlightResult {
  if (!validInput(input)) return Object.freeze({ ok: false, error: 'invalid-input' })

  const destinationRadius = clamp(
    Math.max(input.bodyR * 14, input.systemExtent * 1.35),
    input.bodyR * 8,
    input.overviewRadius * 0.72,
  )
  if (!Number.isFinite(destinationRadius) || destinationRadius <= 0) {
    return Object.freeze({ ok: false, error: 'invalid-input' })
  }

  const flight = Object.freeze({
    token: input.token,
    starKey: input.starKey,
    from: freezePose(input.start),
    to: freezePose({ target: input.targetStar, radius: destinationRadius }),
    durationMs: cameraFlightDuration(input.distance, input.reducedMotion, input.requestedMs),
  })
  return Object.freeze({ ok: true, flight })
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value)
}

export function flightFrame(flight: CameraFlight, progress: number): CameraFrameResult {
  if (!Number.isFinite(progress)
    || !finiteVector(flight.from.target)
    || !finiteVector(flight.to.target)
    || !Number.isFinite(flight.from.radius)
    || !Number.isFinite(flight.to.radius)
    || flight.from.radius <= 0
    || flight.to.radius <= 0) {
    return Object.freeze({ ok: false, error: 'invalid-frame' })
  }

  const clampedProgress = clamp(progress, 0, 1)
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
    this.#generation += 1
    this.#activeToken = null
    if (reason !== 'user') this.#selectedStarKey = null
  }

  isActive(token: number): boolean {
    return token === this.#activeToken
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
