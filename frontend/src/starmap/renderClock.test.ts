import { describe, expect, test } from 'vitest'
import { resumeRenderClock } from './renderClock'

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
