import { describe, expect, it } from 'vitest'
import { cameraDamping, planetInteractionRim, transitionEase } from './interactionFeedback'
import { planetFragmentShader } from './shaders/planet.fragment.fx'

describe('camera damping', () => {
  it('glides in normal motion and settles fast under reduced motion', () => {
    const glide = cameraDamping(false)
    const settle = cameraDamping(true)
    // 惯性越大越滑；Reduced Motion 的用户要的是「到位就停」，不是漂移。
    expect(glide.inertia).toBeGreaterThan(settle.inertia)
    expect(settle.inertia).toBeGreaterThanOrEqual(0)
    expect(glide.inertia).toBeLessThan(1)
  })

  it('never turns the camera into a free spinner', () => {
    for (const reduced of [false, true]) {
      const damping = cameraDamping(reduced)
      expect(damping.inertia).toBeLessThanOrEqual(0.94)
      expect(damping.panningInertia).toBeLessThanOrEqual(damping.inertia)
      expect(damping.angularSensibility).toBeGreaterThan(0)
      expect(damping.wheelDeltaPercentage).toBeGreaterThan(0)
    }
  })

  it('keeps the restored wheel step, which the exit ladder is calibrated against', () => {
    // 滚轮阶梯的三个阈值是按这个步长标定的（批次 4）。阻尼可以改惯性，
    // 不能改步长 —— 那会连带改掉退出层级的手感。
    for (const reduced of [false, true]) {
      expect(cameraDamping(reduced).wheelDeltaPercentage).toBe(0.012)
    }
  })
})

describe('planet interaction rim', () => {
  it('is invisible when the planet is neither hovered nor selected', () => {
    expect(planetInteractionRim(0, 0).intensity).toBe(0)
  })

  it('reads on hover and reads more when selected', () => {
    const hover = planetInteractionRim(1, 0)
    const selected = planetInteractionRim(0, 1)
    const both = planetInteractionRim(1, 1)
    expect(hover.intensity).toBeGreaterThan(0.05)
    expect(selected.intensity).toBeGreaterThan(hover.intensity)
    expect(both.intensity).toBeGreaterThanOrEqual(selected.intensity)
  })

  it('stays a rim, never a wash over the whole body', () => {
    expect(planetInteractionRim(1, 1).intensity).toBeLessThanOrEqual(0.42)
  })

  it('warms on hover and cools on selection so the two states never look alike', () => {
    expect(planetInteractionRim(1, 0).color[0]).toBeGreaterThan(planetInteractionRim(0, 1).color[0])
    expect(planetInteractionRim(0, 1).color[2]).toBeGreaterThan(planetInteractionRim(1, 0).color[2])
  })

  it('is driven by a uniform the shader actually declares', () => {
    expect(planetFragmentShader).toContain('uniform float uHovered')
    expect(planetFragmentShader).toContain('uniform vec3 uInteractionColor')
    expect(planetFragmentShader).toContain('uInteractionRim')
  })
})

describe('transition ease', () => {
  it('starts and ends still, which is what makes a cut read as a move', () => {
    expect(transitionEase(0)).toBe(0)
    expect(transitionEase(1)).toBe(1)
    expect(transitionEase(0.02)).toBeLessThan(0.02)
    expect(transitionEase(0.98)).toBeGreaterThan(0.98)
  })

  it('is monotonic and bounded outside the window', () => {
    let previous = -1
    for (let step = 0; step <= 20; step += 1) {
      const value = transitionEase(step / 20)
      expect(value).toBeGreaterThanOrEqual(previous)
      previous = value
    }
    expect(transitionEase(-3)).toBe(0)
    expect(transitionEase(4)).toBe(1)
    expect(transitionEase(Number.NaN)).toBe(0)
  })
})
