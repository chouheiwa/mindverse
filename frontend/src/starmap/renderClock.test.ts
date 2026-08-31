import { describe, expect, test } from 'vitest'
import { measureFrameTiming, resumeRenderClock } from './renderClock'

describe('resumeRenderClock', () => {
  test('shifts all animation origins by the paused duration without advancing orbit time', () => {
    expect(resumeRenderClock({ t0: 100, skipAt: 250, lastTouch: 300 }, 400, 1_400)).toEqual({
      t0: 1_100, skipAt: 1_250, lastTouch: 1_300, lastNow: 1_400,
    })
  })

  test('preserves absent origins and rejects backwards clocks without a jump', () => {
    expect(resumeRenderClock({ t0: null, skipAt: null, lastTouch: -1e9 }, 500, 450)).toEqual({
      t0: null, skipAt: null, lastTouch: -1e9, lastNow: 450,
    })
  })
})

describe('measureFrameTiming', () => {
  test('preserves an 80ms observed interval while clamping animation delta to 50ms', () => {
    expect(measureFrameTiming(1_000, 1_080)).toEqual({
      rawFrameMs: 80,
      animationDeltaSeconds: 0.05,
    })
  })

  test('normalizes a first, backwards, or non-finite frame interval to zero', () => {
    expect(measureFrameTiming(null, 1_000)).toEqual({ rawFrameMs: 0, animationDeltaSeconds: 0 })
    expect(measureFrameTiming(1_000, 900)).toEqual({ rawFrameMs: 0, animationDeltaSeconds: 0 })
    expect(measureFrameTiming(1_000, Number.NaN)).toEqual({ rawFrameMs: 0, animationDeltaSeconds: 0 })
  })
})
