import { describe, expect, it } from 'vitest'
import { planetMotionTime } from './planetMotion'

describe('planets stop orbiting once you are inside their system', () => {
  it('keeps orbiting in the panorama', () => {
    expect(planetMotionTime({ elapsedMs: 4200, frozenAtMs: null, reducedMotion: false })).toBe(4200)
  })

  it('holds still at the moment you entered, so the target stops moving', () => {
    // 冻的是时间戳而不是把角度归零 —— 归零会让行星瞬移到轨道起点。
    expect(planetMotionTime({ elapsedMs: 9000, frozenAtMs: 4200, reducedMotion: false })).toBe(4200)
    expect(planetMotionTime({ elapsedMs: 99999, frozenAtMs: 4200, reducedMotion: false })).toBe(4200)
  })

  it('resumes exactly where it stopped when the freeze lifts', () => {
    const frozen = planetMotionTime({ elapsedMs: 9000, frozenAtMs: 4200, reducedMotion: false })
    expect(planetMotionTime({ elapsedMs: frozen, frozenAtMs: null, reducedMotion: false })).toBe(frozen)
  })

  it('still pins to zero under reduced motion, whatever the freeze says', () => {
    expect(planetMotionTime({ elapsedMs: 9000, frozenAtMs: 4200, reducedMotion: true })).toBe(0)
    expect(planetMotionTime({ elapsedMs: 9000, frozenAtMs: null, reducedMotion: true })).toBe(0)
  })

  it('never returns a non-finite time', () => {
    for (const input of [
      { elapsedMs: Number.NaN, frozenAtMs: null, reducedMotion: false },
      { elapsedMs: 100, frozenAtMs: Number.NaN, reducedMotion: false },
      { elapsedMs: Infinity, frozenAtMs: null, reducedMotion: false },
    ]) {
      expect(Number.isFinite(planetMotionTime(input))).toBe(true)
    }
  })
})
