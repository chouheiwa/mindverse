import { describe, expect, test, vi } from 'vitest'
import { BabylonRuntime, BabylonWebGL2RequiredError, type BabylonRuntimePorts } from './runtime'

function fakePorts(options: { webGLVersion?: number; failListener?: string; releaseContext?: boolean; renderCostMs?: number } = {}) {
  const log: string[] = []
  const listeners = new Map<string, EventListener>()
  let frame: (() => void) | null = null
  let now = 0
  let hidden = false
  const ports: BabylonRuntimePorts = {
    engine: {
      webGLVersion: options.webGLVersion ?? 2,
      runRenderLoop: vi.fn((callback) => { log.push('loop:start'); frame = callback }),
      stopRenderLoop: vi.fn(() => { log.push('loop:stop'); frame = null }),
      resize: vi.fn(() => { log.push('engine:resize') }),
      dispose: vi.fn(() => { log.push('engine:dispose') }),
    },
    scene: {
      render: vi.fn(() => { log.push('scene:render'); now += options.renderCostMs ?? 0 }),
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
    now: () => now,
    isPageHidden: () => hidden,
  }
  return {
    ports, log,
    frame: (timestamp = now) => { now = timestamp; frame?.() },
    setHidden: (value: boolean) => { hidden = value },
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
    expect(runtime.diagnostics()).toMatchObject({ renderLoops: 1, listeners: 2 })
    fake.frame(0)
    fake.frame(34)

    expect(fake.ports.engine.runRenderLoop).toHaveBeenCalledOnce()
    expect(fake.ports.scene.render).toHaveBeenCalledTimes(2)
    expect(onReady).toHaveBeenCalledOnce()
  })

  test('throttles quiet frames to about 30 FPS and animation frames to at most 60 FPS', () => {
    const fake = fakePorts()
    let animating = false
    const runtime = new BabylonRuntime(fake.ports, { isAnimating: () => animating })
    runtime.start()

    for (const timestamp of [0, 16, 33]) fake.frame(timestamp)
    expect(fake.ports.scene.render).toHaveBeenCalledOnce()
    for (const timestamp of [34, 50, 68]) fake.frame(timestamp)
    expect(fake.ports.scene.render).toHaveBeenCalledTimes(3)

    animating = true
    fake.frame(69)
    fake.frame(85.2)
    expect(fake.ports.scene.render).toHaveBeenCalledTimes(4)
    for (const timestamp of [85.7, 102, 102.4]) fake.frame(timestamp)
    expect(fake.ports.scene.render).toHaveBeenCalledTimes(6)
    expect(runtime.diagnostics()).toMatchObject({ actualRenders: 6 })
  })

  test('keeps the single engine loop but skips scene.render while the page is hidden', () => {
    const fake = fakePorts()
    const runtime = new BabylonRuntime(fake.ports)
    runtime.start()
    fake.frame(0)
    fake.setHidden(true)
    fake.frame(40)
    fake.frame(80)
    fake.setHidden(false)
    fake.frame(81)

    expect(fake.ports.engine.runRenderLoop).toHaveBeenCalledOnce()
    expect(fake.ports.scene.render).toHaveBeenCalledTimes(2)
  })

  test('suspends actual rendering without unregistering or recreating the unique engine loop', () => {
    const fake = fakePorts()
    const runtime = new BabylonRuntime(fake.ports)

    runtime.start()
    runtime.suspend()
    runtime.suspend()
    runtime.resume()
    runtime.resume()

    expect(fake.ports.engine.runRenderLoop).toHaveBeenCalledOnce()
    expect(fake.ports.engine.stopRenderLoop).not.toHaveBeenCalled()
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
    expect(runtime.diagnostics()).toMatchObject({ renderLoops: 0, listeners: 2 })
    runtime.start()

    runtime.destroy()
    runtime.destroy()
    expect(runtime.diagnostics()).toMatchObject({ renderLoops: 0, listeners: 0 })
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

describe('BabylonRuntime render cost metering', () => {
  test('reports the time spent inside scene.render, not the scheduling interval', () => {
    const harness = fakePorts({ renderCostMs: 7 })
    const runtime = new BabylonRuntime(harness.ports, { isAnimating: () => true })
    runtime.start()

    expect(runtime.diagnostics().lastRenderCostMs).toBe(0)
    harness.frame(0)
    harness.frame(100)
    harness.frame(200)

    // Three renders spaced 100 ms apart, each costing 7 ms of work.
    expect(runtime.diagnostics().actualRenders).toBe(3)
    expect(runtime.diagnostics().lastRenderCostMs).toBeCloseTo(7, 6)
    expect(runtime.diagnostics().maxRenderCostMs).toBeCloseTo(7, 6)
  })

  test('resetRenderCostPeak drops the startup spike and re-measures from the next frame', () => {
    // 冷启动的着色器编译/纹理上传会把峰值顶到远高于稳态。预算想约束的是稳态，
    // 所以采样窗开始前必须能把峰值清零，否则比的是两次冷启动尖峰。
    let cost = 40
    const harness = fakePorts({ get renderCostMs() { return cost } } as never)
    const runtime = new BabylonRuntime(harness.ports, { isAnimating: () => true })
    runtime.start()

    harness.frame(0)
    expect(runtime.diagnostics().maxRenderCostMs).toBeCloseTo(40, 6)

    runtime.resetRenderCostPeak()
    expect(runtime.diagnostics().maxRenderCostMs).toBe(0)

    cost = 3
    harness.frame(100)
    harness.frame(200)
    expect(runtime.diagnostics().maxRenderCostMs).toBeCloseTo(3, 6)
    // 清零只影响峰值，不影响已经渲染过多少帧。
    expect(runtime.diagnostics().actualRenders).toBe(3)
  })

  test('keeps the cost at zero when the throttle skips a frame', () => {
    const harness = fakePorts({ renderCostMs: 4 })
    const runtime = new BabylonRuntime(harness.ports, { isAnimating: () => false })
    runtime.start()

    harness.frame(0)
    const afterFirst = runtime.diagnostics().actualRenders
    harness.frame(5) // Inside the 30fps idle interval, so no render happens.

    expect(runtime.diagnostics().actualRenders).toBe(afterFirst)
    expect(runtime.diagnostics().maxRenderCostMs).toBeCloseTo(4, 6)
  })
})
