import { describe, expect, it } from 'vitest'
import { BACKDROP_STAR_FOCUS_GAIN, backdropGain, type BackdropPhase } from './backdropVisibility'

describe('the universe is a backdrop, and the planet stage has no backdrop', () => {
  it('shows the universe in full at panorama', () => {
    expect(backdropGain('panorama')).toBe(1)
  })

  it('retreats but keeps the universe while a star system is the subject', () => {
    expect(backdropGain('approach')).toBe(BACKDROP_STAR_FOCUS_GAIN)
    expect(backdropGain('star-focus')).toBe(BACKDROP_STAR_FOCUS_GAIN)
    expect(BACKDROP_STAR_FOCUS_GAIN).toBeGreaterThan(0)
    expect(BACKDROP_STAR_FOCUS_GAIN).toBeLessThan(1)
  })

  it('removes the universe entirely once a question planet is the subject', () => {
    // 进到一颗行星就是「地表」：这个阶段不该再有星空、星云、尘埃、星群环，
    // 也不该有别的恒星和轨道椭圆。留一点余晖也不行 —— 那还是宇宙视角。
    expect(backdropGain('planet-focus')).toBe(0)
    expect(backdropGain('strata')).toBe(0)
  })

  it('never returns anything outside [0,1]', () => {
    const phases: BackdropPhase[] = ['panorama', 'approach', 'star-focus', 'planet-focus', 'strata']
    for (const phase of phases) {
      const gain = backdropGain(phase)
      expect(Number.isFinite(gain)).toBe(true)
      expect(gain).toBeGreaterThanOrEqual(0)
      expect(gain).toBeLessThanOrEqual(1)
    }
  })
})
