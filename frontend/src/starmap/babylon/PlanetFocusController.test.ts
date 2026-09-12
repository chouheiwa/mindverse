import { describe, expect, test, vi } from 'vitest'
import {
  PlanetFocusController,
  type FocusCameraPort,
  type FocusCameraPose,
  type FocusPlanetVisualPort,
} from './PlanetFocusController'

const pose = (radius: number, x = 0): FocusCameraPose => ({ target: { x, y: 0, z: 0 }, radius })

function setup(reducedMotion = false) {
  let currentPose = pose(30, -5)
  const camera: FocusCameraPort = {
    readPose: vi.fn(() => currentPose),
    writePose: vi.fn((next) => { currentPose = { target: { ...next.target }, radius: next.radius } }),
    stopInertia: vi.fn(),
    orbit: vi.fn(),
  }
  const visual: FocusPlanetVisualPort = {
    radius: 2,
    focusTarget: vi.fn(() => ({ x: 10, y: 2, z: -3 })),
    setFocusBlend: vi.fn(),
    rotate: vi.fn(),
  }
  const onExit = vi.fn()
  const controller = new PlanetFocusController(camera, onExit, { reducedMotion, transitionMs: 100 })
  return { camera, visual, onExit, controller, readPose: () => currentPose }
}

describe('PlanetFocusController framing', () => {
  test('enters at the distance the caller derives from the orbit, not from the planet radius', () => {
    const { controller, visual, readPose } = setup()
    // Three planetDist(orbitR) puts the camera and the star the same order of
    // magnitude from the planet; planetRadius * 4 made the star a backdrop.
    controller.enter(visual, 3.4)
    controller.update(10_000)
    expect(readPose().radius).toBeCloseTo(3.4, 6)
  })

  test('keeps the wheel inside the range the caller asks for', () => {
    const { controller, visual, readPose } = setup()
    controller.enter(visual, 4, { low: 1.2, high: 6 })
    controller.update(10_000)
    for (let step = 0; step < 40; step += 1) controller.wheel(-120)
    expect(readPose().radius).toBeGreaterThanOrEqual(1.2 - 1e-6)
    for (let step = 0; step < 80; step += 1) controller.wheel(120)
    expect(readPose().radius).toBeLessThanOrEqual(6 + 1e-6)
  })

  test('still frames something sane when no explicit distance is supplied', () => {
    const { controller, visual, readPose } = setup()
    controller.enter(visual)
    controller.update(10_000)
    expect(readPose().radius).toBeGreaterThan(0)
  })
})

describe('PlanetFocusController state machine', () => {
  test('moves idle -> entering -> focused -> exiting -> idle and restores framing', () => {
    const { controller, visual, readPose } = setup()

    controller.enter(visual)
    expect(controller.state).toBe('entering')
    controller.update(50)
    expect(readPose().target.x).toBeCloseTo(2.5)
    expect(visual.setFocusBlend).toHaveBeenLastCalledWith(0.5)
    controller.update(50)
    expect(controller.state).toBe('focused')
    expect(readPose()).toEqual({ target: { x: 10, y: 2, z: -3 }, radius: 8 })

    controller.exit()
    expect(controller.state).toBe('exiting')
    controller.update(100)
    expect(controller.state).toBe('idle')
    expect(readPose()).toEqual(pose(30, -5))
    expect(visual.setFocusBlend).toHaveBeenLastCalledWith(0)
  })

  test('finishes an in-flight handoff immediately when reduced motion is enabled', () => {
    const { controller, visual, camera } = setup()

    controller.enter(visual)
    controller.update(20)
    controller.setReducedMotion(true)

    expect(controller.state).toBe('focused')
    expect(visual.setFocusBlend).toHaveBeenLastCalledWith(1)
    expect(camera.stopInertia).toHaveBeenCalled()

    controller.exit()
    expect(controller.state).toBe('idle')
    expect(visual.setFocusBlend).toHaveBeenLastCalledWith(0)
  })

  test('suspends without invoking navigation and restores the original camera', () => {
    const { controller, visual, onExit, readPose } = setup(true)
    controller.enter(visual)

    controller.suspend()

    expect(controller.state).toBe('idle')
    expect(onExit).not.toHaveBeenCalled()
    expect(readPose()).toEqual(pose(30, -5))
  })

  test('can suspend for strata without replacing the current entry camera pose', () => {
    const { controller, visual, onExit, readPose } = setup(true)
    controller.enter(visual)
    const focusedPose = readPose()

    controller.suspend(false)

    expect(controller.state).toBe('idle')
    expect(onExit).not.toHaveBeenCalled()
    expect(readPose()).toEqual(focusedPose)
  })
})

describe('PlanetFocusController input', () => {
  test('does not consume ordinary panorama input while idle', () => {
    const { controller, camera } = setup()

    expect(controller.drag(20, 10)).toBe(false)
    expect(controller.wheel(100)).toBe(false)
    expect(controller.pinch(1.2)).toBe(false)
    expect(controller.keyDown('ArrowLeft')).toBe(false)
    expect(camera.writePose).not.toHaveBeenCalled()
  })

  test('supports pointer and keyboard orbiting with reduced-motion-safe inertia', () => {
    // 拖动与方向键都是「绕着行星走」，转的是相机不是网格。
    const { controller, camera, visual } = setup()
    controller.enter(visual)
    controller.update(100)

    expect(controller.drag(20, -10)).toBe(true)
    expect(camera.orbit).toHaveBeenLastCalledWith(-0.1, 0.05)
    controller.update(16)
    expect(camera.orbit).toHaveBeenCalledTimes(2)
    expect(controller.keyDown('ArrowRight')).toBe(true)
    expect(controller.keyDown('w')).toBe(true)
    expect(camera.orbit).toHaveBeenCalledWith(0.08, 0)
    expect(camera.orbit).toHaveBeenCalledWith(0, 0.08)

    controller.setReducedMotion(true)
    const calls = vi.mocked(camera.orbit).mock.calls.length
    controller.update(16)
    expect(camera.orbit).toHaveBeenCalledTimes(calls)
    expect(visual.rotate).not.toHaveBeenCalled()
  })

  test('clamps wheel and pinch zoom to 2.2R..8R', () => {
    const { controller, visual, readPose } = setup(true)
    controller.enter(visual)

    controller.wheel(-100_000)
    expect(readPose().radius).toBeCloseTo(4.4)
    controller.wheel(100_000)
    expect(readPose().radius).toBeCloseTo(16)
    controller.pinch(100)
    expect(readPose().radius).toBeCloseTo(4.4)
    controller.pinch(0.001)
    expect(readPose().radius).toBeCloseTo(16)
  })

  test('Escape starts the return and notifies the owner exactly once', () => {
    const { controller, visual, onExit } = setup()
    controller.enter(visual)
    controller.update(100)

    expect(controller.keyDown('Escape')).toBe(true)
    expect(controller.state).toBe('exiting')
    expect(onExit).toHaveBeenCalledTimes(1)
    expect(controller.keyDown('Escape')).toBe(true)
    expect(onExit).toHaveBeenCalledTimes(1)
  })
})

describe('dragging moves you around the planet, not the planet under you', () => {
  // 之前拖动转的是行星网格。太阳在世界空间固定，于是明暗与轮廓一点不变，只有表面
  // 花纹在滑 —— 读起来就是「纹理跟着我转，但星球没动」。绕着它走才会看到新的一面。
  const focused = () => {
    const kit = setup()
    kit.controller.enter(kit.visual, 3.4)
    kit.controller.update(1000)
    return kit
  }

  test('a drag orbits the camera and never spins the mesh', () => {
    const { controller, camera, visual } = focused()
    expect(controller.drag(30, -12)).toBe(true)
    expect(camera.orbit).toHaveBeenCalledTimes(1)
    const [yaw, pitch] = (camera.orbit as ReturnType<typeof vi.fn>).mock.calls[0]!
    expect(yaw).toBeLessThan(0)
    expect(pitch).toBeGreaterThan(0)
    expect(visual.rotate).not.toHaveBeenCalled()
  })

  test('inertia keeps orbiting after the finger lifts, and decays', () => {
    const { controller, camera, visual } = focused()
    controller.drag(40, 0)
    const afterDrag = (camera.orbit as ReturnType<typeof vi.fn>).mock.calls.length
    controller.update(16)
    controller.update(16)
    const calls = (camera.orbit as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(afterDrag)
    expect(Math.abs(calls[calls.length - 1]![0])).toBeLessThan(Math.abs(calls[afterDrag - 1]![0]))
    expect(visual.rotate).not.toHaveBeenCalled()
  })

  test('inertia carries less than the drag itself, even on slow frames', () => {
    const { controller, camera } = focused()
    controller.drag(240, 0)
    const dragYaw = Math.abs((camera.orbit as ReturnType<typeof vi.fn>).mock.calls[0]![0])
    // 慢硬件：一帧 100ms。跑到停下来为止，惯性总量不得超过拖动本身的一半。
    let tail = 0
    for (let frame = 0; frame < 60; frame += 1) {
      const before = (camera.orbit as ReturnType<typeof vi.fn>).mock.calls.length
      controller.update(100)
      const calls = (camera.orbit as ReturnType<typeof vi.fn>).mock.calls
      if (calls.length > before) tail += Math.abs(calls[calls.length - 1]![0])
    }
    expect(tail).toBeGreaterThan(0)
    expect(tail).toBeLessThan(dragYaw * 0.5)
  })

  test('arrow keys orbit too', () => {
    const { controller, camera, visual } = focused()
    expect(controller.keyDown('ArrowLeft')).toBe(true)
    expect(camera.orbit).toHaveBeenCalled()
    expect(visual.rotate).not.toHaveBeenCalled()
  })

  test('a drag does nothing before focus settles', () => {
    const { controller, camera, visual } = setup()
    expect(controller.drag(30, 30)).toBe(false)
    expect(camera.orbit).not.toHaveBeenCalled()
    expect(visual.rotate).not.toHaveBeenCalled()
  })
})
