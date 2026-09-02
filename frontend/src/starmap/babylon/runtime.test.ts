import { describe, expect, test, vi } from 'vitest'
import { BabylonRuntime, BabylonWebGL2RequiredError, type BabylonRuntimePorts } from './runtime'

function fakePorts(options: { webGLVersion?: number; failListener?: string; releaseContext?: boolean } = {}) {
  const log: string[] = []
  const listeners = new Map<string, EventListener>()
  let frame: (() => void) | null = null
  const ports: BabylonRuntimePorts = {
    engine: {
      webGLVersion: options.webGLVersion ?? 2,
      runRenderLoop: vi.fn((callback) => { log.push('loop:start'); frame = callback }),
      stopRenderLoop: vi.fn(() => { log.push('loop:stop'); frame = null }),
      resize: vi.fn(() => { log.push('engine:resize') }),
      dispose: vi.fn(() => { log.push('engine:dispose') }),
    },
    scene: {
      render: vi.fn(() => { log.push('scene:render') }),
      dispose: vi.fn(() => { log.push('scene:dispose') }),
    },
    canvas: {
      addEventListener: vi.fn((type, listener) => {
        log.push(`listen:${type}`)
        if (options.failListener === type) throw new Error(`cannot listen ${type}`)
        listeners.set(type, listener)
      }),
      removeEventListener: vi.fn((type) => {
        log.push(`unlisten:${type}`)
        listeners.delete(type)
      }),
    },
    ...(options.releaseContext ? { releaseContext: vi.fn(() => { log.push('context:release') }) } : {}),
  }
  return {
    ports, log,
    frame: () => frame?.(),
    dispatch: (type: string, event: Event) => listeners.get(type)?.(event),
  }
}

describe('BabylonRuntime lifecycle shell', () => {
  test('requires WebGL2 and disposes partial construction in reverse order', () => {
    const fake = fakePorts({ webGLVersion: 1 })

    expect(() => new BabylonRuntime(fake.ports)).toThrow(BabylonWebGL2RequiredError)
    expect(fake.log).toEqual(['scene:dispose', 'engine:dispose'])
  })

  test('rolls back a listener registration failure in reverse order', () => {
    const fake = fakePorts({ failListener: 'webglcontextrestored' })

    expect(() => new BabylonRuntime(fake.ports)).toThrow(/cannot listen/)
    expect(fake.log).toEqual([
      'listen:webglcontextlost', 'listen:webglcontextrestored',
      'unlisten:webglcontextlost', 'scene:dispose', 'engine:dispose',
    ])
  })

  test('owns one render loop and reports readiness after the first successful frame once', () => {
    const fake = fakePorts()
    const onReady = vi.fn()
    const runtime = new BabylonRuntime(fake.ports, { onReady })

    runtime.start()
    runtime.start()
    expect(runtime.diagnostics()).toEqual({ renderLoops: 1, listeners: 2 })
    fake.frame()
    fake.frame()

    expect(fake.ports.engine.runRenderLoop).toHaveBeenCalledOnce()
    expect(fake.ports.scene.render).toHaveBeenCalledTimes(2)
    expect(onReady).toHaveBeenCalledOnce()
  })

  test('suspends and resumes the requested loop without creating concurrent loops', () => {
    const fake = fakePorts()
    const runtime = new BabylonRuntime(fake.ports)

    runtime.start()
    runtime.suspend()
    runtime.suspend()
    runtime.resume()
    runtime.resume()

    expect(fake.ports.engine.runRenderLoop).toHaveBeenCalledTimes(2)
    expect(fake.ports.engine.stopRenderLoop).toHaveBeenCalledOnce()
  })

  test('resizes the engine and reports render failure once', () => {
    const fake = fakePorts()
    const failure = new Error('render failed')
    vi.mocked(fake.ports.scene.render).mockImplementation(() => { throw failure })
    const onError = vi.fn()
    const runtime = new BabylonRuntime(fake.ports, { onError })

    runtime.resize()
    runtime.start()
    fake.frame()
    fake.frame()

    expect(fake.ports.engine.resize).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(failure)
    expect(fake.ports.engine.stopRenderLoop).toHaveBeenCalledOnce()
  })

  test('prevents default on context loss and reports only one fatal error', () => {
    const fake = fakePorts()
    const onError = vi.fn()
    new BabylonRuntime(fake.ports, { onError })
    const first = new Event('webglcontextlost', { cancelable: true })
    const second = new Event('webglcontextlost', { cancelable: true })

    fake.dispatch('webglcontextlost', first)
    fake.dispatch('webglcontextlost', second)

    expect(first.defaultPrevented).toBe(true)
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0][0]).toEqual(expect.objectContaining({ name: 'WebGLContextLostError' }))
  })

  test('destroys listeners, scene and engine exactly once and suppresses late callbacks', () => {
    const fake = fakePorts({ releaseContext: true })
    const onReady = vi.fn()
    const onError = vi.fn()
    const runtime = new BabylonRuntime(fake.ports, { onReady, onError })
    expect(runtime.diagnostics()).toEqual({ renderLoops: 0, listeners: 2 })
    runtime.start()

    runtime.destroy()
    runtime.destroy()
    expect(runtime.diagnostics()).toEqual({ renderLoops: 0, listeners: 0 })
    fake.frame()
    fake.dispatch('webglcontextlost', new Event('webglcontextlost', { cancelable: true }))
    fake.dispatch('webglcontextrestored', new Event('webglcontextrestored'))

    expect(fake.log.slice(-6)).toEqual([
      'loop:stop', 'unlisten:webglcontextrestored', 'unlisten:webglcontextlost',
      'scene:dispose', 'engine:dispose', 'context:release',
    ])
    expect(onReady).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(fake.ports.scene.dispose).toHaveBeenCalledOnce()
    expect(fake.ports.engine.dispose).toHaveBeenCalledOnce()
  })
})
