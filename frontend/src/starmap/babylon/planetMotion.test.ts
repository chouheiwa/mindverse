import { describe, expect, it } from 'vitest'
import {
  INITIAL_ORBIT_CLOCK, ORBIT_TEMPO, orbitClockTime, orbitTempoFor,
  planetSpinAngle, PLANET_SPIN_MIN_PERIOD_MS, PLANET_SPIN_PERIOD_SPAN_MS, retimeOrbitClock,
} from './planetMotion'

// 公转的节奏，而不是开关。全景里全速；进了恒星系慢速继续 —— 镜头跟着恒星走，
// 公转若冻住，画面里就什么都不动了；只有选中某颗行星（要点它、要落地）才真停住。
describe('the orbit clock changes tempo without ever jumping', () => {
  it('runs at full speed in the panorama', () => {
    expect(orbitClockTime(INITIAL_ORBIT_CLOCK, 4200)).toBe(4200)
  })

  it('slows down inside a star system and keeps continuity at the switch', () => {
    const slowed = retimeOrbitClock(INITIAL_ORBIT_CLOCK, 4200, ORBIT_TEMPO.starFocus)
    expect(orbitClockTime(slowed, 4200)).toBe(4200)
    expect(orbitClockTime(slowed, 9000)).toBeCloseTo(4200 + 4800 * ORBIT_TEMPO.starFocus, 9)
    expect(ORBIT_TEMPO.starFocus).toBeGreaterThan(0)
    expect(ORBIT_TEMPO.starFocus).toBeLessThan(0.5)
  })

  it('holds still while a planet is selected, and resumes from where it stopped', () => {
    const slowed = retimeOrbitClock(INITIAL_ORBIT_CLOCK, 4200, ORBIT_TEMPO.starFocus)
    const held = retimeOrbitClock(slowed, 9000, ORBIT_TEMPO.held)
    const heldAt = orbitClockTime(held, 9000)
    expect(orbitClockTime(held, 30000)).toBe(heldAt)
    const resumed = retimeOrbitClock(held, 30000, ORBIT_TEMPO.panorama)
    expect(orbitClockTime(resumed, 30000)).toBe(heldAt)
    expect(orbitClockTime(resumed, 31000)).toBe(heldAt + 1000)
  })

  it('is a no-op when the tempo does not change', () => {
    const slowed = retimeOrbitClock(INITIAL_ORBIT_CLOCK, 4200, ORBIT_TEMPO.starFocus)
    expect(retimeOrbitClock(slowed, 9000, ORBIT_TEMPO.starFocus)).toBe(slowed)
  })

  it('never returns a non-finite time', () => {
    const state = retimeOrbitClock(INITIAL_ORBIT_CLOCK, Number.NaN, Number.NaN)
    expect(Number.isFinite(orbitClockTime(state, Infinity))).toBe(true)
    expect(Number.isFinite(orbitClockTime(INITIAL_ORBIT_CLOCK, Number.NaN))).toBe(true)
  })

  it('picks the tempo from what the user is doing', () => {
    expect(orbitTempoFor({ starFocused: false, planetSelected: false })).toBe(ORBIT_TEMPO.panorama)
    expect(orbitTempoFor({ starFocused: true, planetSelected: false })).toBe(ORBIT_TEMPO.starFocus)
    expect(orbitTempoFor({ starFocused: true, planetSelected: true })).toBe(ORBIT_TEMPO.held)
  })
})

describe('planets turn on their own', () => {
  // 选中行星时公转停住（否则它是移动靶），但自转必须继续 —— 自转不改变它在屏幕上的
  // 位置，点击一样准，而画面里它是活的。之前连自转都没有，看起来就是一颗死球。
  it('advances with the frame clock and wraps into one turn', () => {
    const a = planetSpinAngle(7, 0)
    const b = planetSpinAngle(7, 5_000)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(Math.PI * 2)
    expect(b).not.toBeCloseTo(a, 6)
    expect(b).toBeGreaterThanOrEqual(0)
    expect(b).toBeLessThan(Math.PI * 2)
  })

  it('gives each planet its own period, all of them slow', () => {
    const periods = new Set<number>()
    for (let seed = 0; seed < 24; seed += 1) {
      // 走满一圈要多久：用一个很小的步长反推角速度。
      const step = planetSpinAngle(seed, 1_000) - planetSpinAngle(seed, 0)
      const periodMs = (Math.PI * 2) / Math.abs(step) * 1_000
      periods.add(Math.round(periodMs))
      expect(periodMs).toBeGreaterThanOrEqual(PLANET_SPIN_MIN_PERIOD_MS - 1)
      expect(periodMs).toBeLessThanOrEqual(PLANET_SPIN_MIN_PERIOD_MS + PLANET_SPIN_PERIOD_SPAN_MS + 1)
    }
    // 不是所有行星同一个转速，否则整屏同步转很假。
    expect(periods.size).toBeGreaterThan(6)
  })

  it('never returns a non-finite angle', () => {
    for (const [seed, time] of [[Number.NaN, 1000], [3, Number.NaN], [3, Infinity], [Infinity, 5]] as const) {
      const angle = planetSpinAngle(seed, time)
      expect(Number.isFinite(angle)).toBe(true)
      expect(angle).toBeGreaterThanOrEqual(0)
      expect(angle).toBeLessThan(Math.PI * 2)
    }
  })
})
