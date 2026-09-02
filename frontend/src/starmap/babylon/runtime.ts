export interface BabylonEnginePort {
  readonly webGLVersion: number
  runRenderLoop(callback: () => void): void
  stopRenderLoop(callback?: () => void): void
  resize(): void
  dispose(): void
}

export interface BabylonScenePort {
  render(): void
  dispose(): void
}

export interface BabylonCanvasPort {
  addEventListener(type: string, listener: EventListener): void
  removeEventListener(type: string, listener: EventListener): void
}

export interface BabylonRuntimePorts {
  readonly engine: BabylonEnginePort
  readonly scene: BabylonScenePort
  readonly canvas: BabylonCanvasPort
}

export interface BabylonRuntimeCallbacks {
  readonly onReady?: () => void
  readonly onError?: (cause: Error) => void
}

export class BabylonWebGL2RequiredError extends Error {
  readonly code = 'webgl2_required'

  constructor() {
    super('当前设备不支持 WebGL2，无法启动 3D 宇宙。')
    this.name = 'BabylonWebGL2RequiredError'
  }
}

export class BabylonRuntime {
  private readonly cleanups: Array<() => void> = []
  private readonly ports: BabylonRuntimePorts
  private readonly callbacks: BabylonRuntimeCallbacks
  private running = false
  private requested = false
  private suspended = false
  private destroyed = false
  private readyReported = false
  private fatalReported = false

  constructor(ports: BabylonRuntimePorts, callbacks: BabylonRuntimeCallbacks = {}) {
    this.ports = ports
    this.callbacks = callbacks
    this.cleanups.push(() => ports.engine.dispose())
    this.cleanups.push(() => ports.scene.dispose())
    try {
      if (ports.engine.webGLVersion < 2) throw new BabylonWebGL2RequiredError()
      this.listen('webglcontextlost', this.onContextLost)
      this.listen('webglcontextrestored', this.onContextRestored)
    } catch (cause) {
      this.destroyed = true
      this.disposeAll()
      throw cause
    }
  }

  start(): void {
    if (this.destroyed || this.fatalReported) return
    this.requested = true
    this.startRequestedLoop()
  }

  stop(): void {
    this.requested = false
    this.stopActiveLoop()
  }

  suspend(): void {
    if (this.destroyed || this.suspended) return
    this.suspended = true
    this.stopActiveLoop()
  }

  resume(): void {
    if (this.destroyed || !this.suspended) return
    this.suspended = false
    this.startRequestedLoop()
  }

  resize(): void {
    if (!this.destroyed) this.ports.engine.resize()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.requested = false
    this.stopActiveLoop()
    this.disposeAll()
  }

  private readonly frame = (): void => {
    if (this.destroyed || this.fatalReported) return
    try {
      this.ports.scene.render()
      if (!this.readyReported) {
        this.readyReported = true
        this.callbacks.onReady?.()
      }
    } catch (cause) {
      this.reportFatal(cause)
    }
  }

  private readonly onContextLost: EventListener = (event): void => {
    event.preventDefault()
    const cause = new Error('WebGL context lost')
    cause.name = 'WebGLContextLostError'
    this.reportFatal(cause)
  }

  private readonly onContextRestored: EventListener = (): void => {
    if (!this.destroyed && !this.fatalReported) this.resize()
  }

  private listen(type: string, listener: EventListener): void {
    this.ports.canvas.addEventListener(type, listener)
    this.cleanups.push(() => this.ports.canvas.removeEventListener(type, listener))
  }

  private startRequestedLoop(): void {
    if (this.running || !this.requested || this.suspended || this.destroyed || this.fatalReported) return
    this.ports.engine.runRenderLoop(this.frame)
    this.running = true
  }

  private stopActiveLoop(): void {
    if (!this.running) return
    this.running = false
    this.ports.engine.stopRenderLoop(this.frame)
  }

  private reportFatal(cause: unknown): void {
    if (this.destroyed || this.fatalReported) return
    this.fatalReported = true
    this.requested = false
    this.stopActiveLoop()
    this.callbacks.onError?.(cause instanceof Error ? cause : new Error(String(cause)))
  }

  private disposeAll(): void {
    for (let index = this.cleanups.length - 1; index >= 0; index -= 1) {
      try {
        this.cleanups[index]()
      } catch {
        // Disposal is best-effort; every later resource must still be released.
      }
    }
    this.cleanups.length = 0
  }
}
