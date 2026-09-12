import { describe, expect, it } from 'vitest'
import {
  advanceDescent, descentEase, descentProgress, IDLE_DESCENT_CLOCK,
  MAX_DESCENT_FRAME_STEP_MS, type DescentClock, type DescentTick,
} from './surfaceDescent'

const tick: DescentTick = {
  frameDeltaMs: 16, worldReady: true, totalMs: 1100, reducedMotion: false,
}

describe('surface descent advances only visible frames', () => {
  it('waits indefinitely for the world without allocating new states', () => {
    let clock = IDLE_DESCENT_CLOCK
    for (let frame = 0; frame < 100; frame += 1) {
      clock = advanceDescent(clock, { ...tick, worldReady: false, frameDeltaMs: 2000 })
      expect(clock).toBe(IDLE_DESCENT_CLOCK)
      expect(clock).toEqual({ elapsedMs: 0, started: false })
      expect(descentProgress(clock, 1100, false)).toBe(0)
    }
  })

  it('starts on the first ready frame and never pauses again', () => {
    const started = advanceDescent(IDLE_DESCENT_CLOCK, tick)
    expect(started).toEqual({ elapsedMs: 16, started: true })
    expect(advanceDescent(started, { ...tick, worldReady: false }))
      .toEqual({ elapsedMs: 32, started: true })
  })

  it('limits a cold-start frame to 34 ms, independent of duration', () => {
    expect(MAX_DESCENT_FRAME_STEP_MS).toBe(34)
    for (const totalMs of [1100, 10000]) {
      const clock = advanceDescent(IDLE_DESCENT_CLOCK, { ...tick, totalMs, frameDeltaMs: 2000 })
      expect(clock.elapsedMs).toBe(MAX_DESCENT_FRAME_STEP_MS)
    }
  })

  it('takes 69 frames at 16 ms to complete 1100 ms with strictly rising progress', () => {
    let clock = IDLE_DESCENT_CLOCK
    let previous = 0
    for (let frame = 1; frame <= 69; frame += 1) {
      clock = advanceDescent(clock, tick)
      const progress = descentProgress(clock, 1100, false)
      expect(progress).toBeGreaterThan(previous)
      if (frame < 69) expect(progress).toBeLessThan(1)
      previous = progress
    }
    expect(previous).toBe(1)
    expect(clock.elapsedMs).toBe(1100)
    expect(advanceDescent(clock, tick)).toBe(clock)
  })

  it('reports immediate completion for reduced motion and unusable durations', () => {
    expect(descentProgress(IDLE_DESCENT_CLOCK, 1100, true)).toBe(1)
    for (const totalMs of [0, -1, NaN, Infinity, -Infinity]) {
      expect(descentProgress(IDLE_DESCENT_CLOCK, totalMs, false)).toBe(1)
    }
  })

  it('ignores invalid frame deltas without rewinding elapsed time', () => {
    const clock = advanceDescent(IDLE_DESCENT_CLOCK, tick)
    for (const frameDeltaMs of [0, -1, NaN, Infinity, -Infinity]) {
      expect(advanceDescent(clock, { ...tick, frameDeltaMs })).toBe(clock)
    }
  })

  it('never rewinds when duration shrinks or becomes invalid', () => {
    const clock = advanceDescent(IDLE_DESCENT_CLOCK, tick)
    for (const totalMs of [8, 0, -1, NaN, Infinity, -Infinity]) {
      const next = advanceDescent(clock, { ...tick, totalMs })
      expect(next.elapsedMs).toBeGreaterThanOrEqual(clock.elapsedMs)
      expect(Number.isFinite(next.elapsedMs)).toBe(true)
      expect(descentProgress(next, totalMs, false)).toBe(1)
    }
  })

  it('repairs invalid elapsed values and keeps all numeric results finite', () => {
    for (const elapsedMs of [NaN, Infinity, -Infinity, -1, 0, Number.MAX_VALUE]) {
      const clock: DescentClock = { elapsedMs, started: true }
      const next = advanceDescent(clock, { ...tick, totalMs: Number.MAX_VALUE })
      expect(Number.isFinite(next.elapsedMs)).toBe(true)
      expect(next.elapsedMs).toBeGreaterThanOrEqual(Number.isFinite(elapsedMs) ? elapsedMs : 0)
      for (const totalMs of [NaN, Infinity, -Infinity, -1, 0, Number.MIN_VALUE, 1100]) {
        const progress = descentProgress(clock, totalMs, false)
        expect(Number.isFinite(progress)).toBe(true)
        expect(progress).toBeGreaterThanOrEqual(0)
        expect(progress).toBeLessThanOrEqual(1)
      }
    }
  })

  it('freezes every result and preserves references when unchanged', () => {
    expect(Object.isFrozen(IDLE_DESCENT_CLOCK)).toBe(true)
    const input: DescentClock = { elapsedMs: 16, started: true }
    const unchanged = advanceDescent(input, { ...tick, frameDeltaMs: 0 })
    expect(unchanged).toBe(input)
    expect(Object.isFrozen(unchanged)).toBe(true)
    const next = advanceDescent(unchanged, tick)
    expect(next).not.toBe(unchanged)
    expect(Object.isFrozen(next)).toBe(true)
    expect(unchanged.elapsedMs).toBe(16)
  })
})

describe('descent smoothstep', () => {
  it('has exact endpoints and midpoint and clamps finite overshoot', () => {
    for (const [input, expected] of [[0, 0], [1, 1], [0.5, 0.5], [-1, 0], [2, 1]]) {
      expect(descentEase(input)).toBe(expected)
    }
    expect(descentEase(0.25)).toBe(0.15625)
    expect(descentEase(0.75)).toBe(0.84375)
  })

  it('keeps non-finite easing inputs within the unit interval', () => {
    for (const input of [NaN, Infinity, -Infinity]) {
      const eased = descentEase(input)
      expect(Number.isFinite(eased)).toBe(true)
      expect(eased).toBeGreaterThanOrEqual(0)
      expect(eased).toBeLessThanOrEqual(1)
    }
  })
})
