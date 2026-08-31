export type ResourceCleanup = () => void

let failAfter: number | null = null

/** Tree-shaken/inert outside tests; never wire this to user-controlled input. */
export function __failResourceAfterForTests(count: number | null): void {
  if (import.meta.env.MODE !== 'test') return
  failAfter = count
}

/** Owns resources while an object is being constructed. */
export class ResourceScope {
  private cleanups: ResourceCleanup[] = []
  private closed = false

  defer(cleanup: ResourceCleanup): ResourceCleanup {
    let active = true
    const once = () => {
      if (!active) return
      active = false
      cleanup()
    }
    if (this.closed) {
      once()
      return once
    }
    this.cleanups.push(once)
    if (import.meta.env.MODE === 'test' && failAfter !== null) {
      failAfter -= 1
      if (failAfter === 0) {
        failAfter = null
        throw new Error(`injected resource failure after ${this.cleanups.length}`)
      }
    }
    return once
  }

  use<T extends { dispose(): void }>(resource: T): T {
    this.defer(() => resource.dispose())
    return resource
  }

  release(): ResourceCleanup {
    if (this.closed) return () => undefined
    this.closed = true
    const cleanups = this.cleanups
    this.cleanups = []
    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i]()
    }
  }

  dispose(): void {
    this.release()()
  }

  static construct<T>(build: (scope: ResourceScope) => T): T {
    const scope = new ResourceScope()
    try {
      return build(scope)
    } catch (cause) {
      scope.dispose()
      throw cause
    }
  }
}

export class RendererSignals {
  private ready = false
  private failed = false
  private destroyed = false
  private readonly onReady?: () => void
  private readonly onError?: (cause: Error) => void

  constructor(
    onReady?: () => void,
    onError?: (cause: Error) => void,
  ) {
    this.onReady = onReady
    this.onError = onError
  }

  frameSucceeded(): boolean {
    if (this.destroyed || this.ready || this.failed) return false
    this.ready = true
    this.onReady?.()
    return true
  }

  frameFailed(cause: unknown): void {
    if (this.destroyed || this.failed) return
    this.failed = true
    this.onError?.(cause instanceof Error ? cause : new Error(String(cause)))
  }

  destroy(): void {
    this.destroyed = true
  }
}
