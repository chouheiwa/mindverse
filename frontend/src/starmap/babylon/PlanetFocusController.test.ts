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

  test('supports pointer and keyboard rotation with reduced-motion-safe inertia', () => {
    const { controller, visual } = setup()
    controller.enter(visual)
    controller.update(100)

    expect(controller.drag(20, -10)).toBe(true)
    expect(visual.rotate).toHaveBeenLastCalledWith(-0.1, 0.05)
    controller.update(16)
    expect(visual.rotate).toHaveBeenCalledTimes(2)
    expect(controller.keyDown('ArrowRight')).toBe(true)
    expect(controller.keyDown('w')).toBe(true)
    expect(visual.rotate).toHaveBeenCalledWith(0.08, 0)
    expect(visual.rotate).toHaveBeenCalledWith(0, 0.08)

    controller.setReducedMotion(true)
    const calls = vi.mocked(visual.rotate).mock.calls.length
    controller.update(16)
    expect(visual.rotate).toHaveBeenCalledTimes(calls)
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
