export interface FocusVector3 {
  x: number
  y: number
  z: number
}

export interface FocusCameraPose {
  target: FocusVector3
  radius: number
}

/** Adapter boundary implemented by the Babylon camera integration. */
export interface FocusCameraPort {
  readPose(): FocusCameraPose
  writePose(pose: FocusCameraPose): void
  stopInertia(): void
}

/** Adapter boundary implemented by a PlanetVisual without exposing Babylon meshes. */
export interface FocusPlanetVisualPort {
  readonly radius: number
  readonly minimumFocusRadiusMultiplier?: number
  focusTarget(): FocusVector3
  setFocusBlend(value: number): void
  rotate(yawDelta: number, pitchDelta: number): void
}

export type PlanetFocusState = 'idle' | 'entering' | 'focused' | 'exiting'

/** 绝对距离范围；由调用方按轨道尺度给出，不再从行星半径推。 */
export interface FocusRadiusRange {
  readonly low: number
  readonly high: number
}

export interface PlanetFocusControllerOptions {
  reducedMotion?: boolean
  transitionMs?: number
  focusRadiusMultiplier?: number
  minRadiusMultiplier?: number
  maxRadiusMultiplier?: number
  pointerRadiansPerPixel?: number
  keyboardStep?: number
  wheelSensitivity?: number
}

const copyPose = (pose: FocusCameraPose): FocusCameraPose => ({
  target: { ...pose.target },
  radius: pose.radius,
})

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount

const lerpPose = (from: FocusCameraPose, to: FocusCameraPose, amount: number): FocusCameraPose => ({
  target: {
    x: lerp(from.target.x, to.target.x, amount),
    y: lerp(from.target.y, to.target.y, amount),
    z: lerp(from.target.z, to.target.z, amount),
  },
  radius: lerp(from.radius, to.radius, amount),
})

export class PlanetFocusController {
  state: PlanetFocusState = 'idle'

  private readonly camera: FocusCameraPort
  private readonly onExit: () => void
  private visual: FocusPlanetVisualPort | null = null
  private returnPose: FocusCameraPose | null = null
  private radiusRange: FocusRadiusRange | null = null
  private transitionFrom: FocusCameraPose | null = null
  private transitionTo: FocusCameraPose | null = null
  private transitionElapsed = 0
  private blendFrom = 0
  private blendTo = 0
  private blend = 0
  private reducedMotion: boolean
  private exitNotified = false
  private yawVelocity = 0
  private pitchVelocity = 0

  private readonly transitionMs: number
  private readonly focusRadiusMultiplier: number
  private readonly minRadiusMultiplier: number
  private readonly maxRadiusMultiplier: number
  private readonly pointerRadiansPerPixel: number
  private readonly keyboardStep: number
  private readonly wheelSensitivity: number

  constructor(
    camera: FocusCameraPort,
    onExit: () => void,
    options: PlanetFocusControllerOptions = {},
  ) {
    this.camera = camera
    this.onExit = onExit
    this.reducedMotion = options.reducedMotion ?? false
    this.transitionMs = Math.max(1, options.transitionMs ?? 420)
    this.focusRadiusMultiplier = options.focusRadiusMultiplier ?? 4
    this.minRadiusMultiplier = options.minRadiusMultiplier ?? 2.2
    this.maxRadiusMultiplier = options.maxRadiusMultiplier ?? 8
    this.pointerRadiansPerPixel = options.pointerRadiansPerPixel ?? 0.005
    this.keyboardStep = options.keyboardStep ?? 0.08
    this.wheelSensitivity = options.wheelSensitivity ?? 0.001
  }

  /**
   * @param focusDistance 目标距离。由调用方按**轨道半径**导出（见 framing.ts）——
   *   用行星半径推会让恒星退化成占满背景的一堵墙。
   * @param radiusRange 滚轮可达的绝对距离范围。
   */
  enter(visual: FocusPlanetVisualPort, focusDistance?: number, radiusRange?: FocusRadiusRange): void {
    if (this.state === 'idle') this.returnPose = copyPose(this.camera.readPose())
    this.visual = visual
    this.exitNotified = false
    this.clearRotationInertia()
    this.radiusRange = radiusRange && Number.isFinite(radiusRange.low) && Number.isFinite(radiusRange.high)
      && radiusRange.low > 0 && radiusRange.high >= radiusRange.low
      ? radiusRange
      : null
    // An explicit distance already carries the orbit-scale reasoning, so it is
    // honoured as given; only the legacy planet-radius fallback needs clamping.
    const radius = Number.isFinite(focusDistance) && (focusDistance as number) > 0
      ? this.radiusRange
        ? Math.min(this.radiusRange.high, Math.max(this.radiusRange.low, focusDistance as number))
        : focusDistance as number
      : this.clampRadius(visual.radius * this.focusRadiusMultiplier)
    this.beginTransition('entering', {
      target: { ...visual.focusTarget() },
      radius,
    }, 1)
  }

  exit(): void {
    if (this.state === 'idle' || !this.visual || !this.returnPose) return
    this.clearRotationInertia()
    this.radiusRange = null
    this.beginTransition('exiting', this.returnPose, 0)
  }

  /** Leaves focus for another renderer mode without requesting navigation. */
  suspend(restoreCamera = true): void {
    if (this.state === 'idle') return
    this.clearRotationInertia()
    if (restoreCamera && this.returnPose) this.camera.writePose(copyPose(this.returnPose))
    if (this.visual) this.visual.setFocusBlend(0)
    this.finishExit()
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced
    this.camera.stopInertia()
    this.clearRotationInertia()
    if (reduced && (this.state === 'entering' || this.state === 'exiting')) this.finishTransition()
  }

  update(deltaMs: number): void {
    if ((this.state === 'entering' || this.state === 'exiting') && Number.isFinite(deltaMs) && deltaMs > 0) {
      this.transitionElapsed += deltaMs
      const amount = Math.min(1, this.transitionElapsed / this.transitionMs)
      this.applyTransition(amount)
      if (amount >= 1) this.finishTransition()
    }

    if (this.state === 'focused' && !this.reducedMotion && this.visual
      && (Math.abs(this.yawVelocity) > 0.0001 || Math.abs(this.pitchVelocity) > 0.0001)) {
      const frameScale = Math.max(0, Math.min(4, deltaMs / 16))
      this.visual.rotate(this.yawVelocity * frameScale, this.pitchVelocity * frameScale)
      const damping = Math.pow(0.84, frameScale)
      this.yawVelocity *= damping
      this.pitchVelocity *= damping
    }
  }

  drag(deltaX: number, deltaY: number): boolean {
    if (this.state !== 'focused' || !this.visual || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return false
    const yaw = -deltaX * this.pointerRadiansPerPixel
    const pitch = -deltaY * this.pointerRadiansPerPixel
    this.visual.rotate(yaw, pitch)
    if (!this.reducedMotion) {
      this.yawVelocity = yaw
      this.pitchVelocity = pitch
    }
    return true
  }

  wheel(deltaY: number): boolean {
    if (this.state !== 'focused' || !Number.isFinite(deltaY)) return false
    const current = this.camera.readPose()
    const nextRadius = this.clampRadius(current.radius * Math.exp(deltaY * this.wheelSensitivity))
    if (deltaY > 0 && nextRadius <= current.radius + 1e-6) return false
    this.camera.writePose({ ...current, radius: nextRadius })
    return true
  }

  /** A scale above one represents fingers moving apart (zoom in). */
  pinch(scale: number): boolean {
    if (this.state !== 'focused' || !Number.isFinite(scale) || scale <= 0) return false
    const current = this.camera.readPose()
    this.camera.writePose({ ...current, radius: this.clampRadius(current.radius / scale) })
    return true
  }

  keyDown(key: string): boolean {
    if (key === 'Escape') {
      if (this.state === 'idle') return false
      if (!this.exitNotified) {
        this.exitNotified = true
        this.exit()
        this.onExit()
      }
      return true
    }
    if (this.state !== 'focused' || !this.visual) return false

    const normalized = key.toLowerCase()
    const rotation: Record<string, readonly [number, number]> = {
      arrowleft: [-this.keyboardStep, 0],
      a: [-this.keyboardStep, 0],
      arrowright: [this.keyboardStep, 0],
      d: [this.keyboardStep, 0],
      arrowup: [0, this.keyboardStep],
      w: [0, this.keyboardStep],
      arrowdown: [0, -this.keyboardStep],
      s: [0, -this.keyboardStep],
    }
    const delta = rotation[normalized]
    if (!delta) return false
    this.visual.rotate(delta[0], delta[1])
    return true
  }

  private beginTransition(state: 'entering' | 'exiting', destination: FocusCameraPose, blendTo: number): void {
    this.state = state
    this.transitionFrom = copyPose(this.camera.readPose())
    this.transitionTo = copyPose(destination)
    this.transitionElapsed = 0
    this.blendFrom = this.blend
    this.blendTo = blendTo
    if (this.reducedMotion) this.finishTransition()
  }

  private applyTransition(amount: number): void {
    if (!this.transitionFrom || !this.transitionTo || !this.visual) return
    this.camera.writePose(lerpPose(this.transitionFrom, this.transitionTo, amount))
    this.blend = lerp(this.blendFrom, this.blendTo, amount)
    this.visual.setFocusBlend(this.blend)
  }

  private finishTransition(): void {
    this.applyTransition(1)
    if (this.state === 'entering') {
      this.state = 'focused'
      return
    }
    if (this.state === 'exiting') this.finishExit()
  }

  private finishExit(): void {
    this.state = 'idle'
    this.visual = null
    this.returnPose = null
    this.transitionFrom = null
    this.transitionTo = null
    this.transitionElapsed = 0
    this.blend = 0
  }

  private clampRadius(radius: number): number {
    if (this.radiusRange) {
      return Math.min(this.radiusRange.high, Math.max(this.radiusRange.low, radius))
    }
    const planetRadius = Number.isFinite(this.visual?.radius) && this.visual!.radius > 0 ? this.visual!.radius : 1
    const visualMinimum = this.visual?.minimumFocusRadiusMultiplier
    const minimumMultiplier = Number.isFinite(visualMinimum) && visualMinimum! > 0
      ? Math.max(this.minRadiusMultiplier, visualMinimum!) : this.minRadiusMultiplier
    return Math.min(planetRadius * this.maxRadiusMultiplier, Math.max(planetRadius * minimumMultiplier, radius))
  }

  private clearRotationInertia(): void {
    this.yawVelocity = 0
    this.pitchVelocity = 0
    this.camera.stopInertia()
  }
}
