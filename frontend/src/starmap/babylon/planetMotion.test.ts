import { describe, expect, it } from 'vitest'
import { planetMotionTime, planetOrbitClock } from './planetMotion'

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

  it('freezes only the orbit, never the frame the star drifts in', () => {
    // 恒星本身在绕星群中心走、还在上下浮动，相机跟着它。冻结公转时若把恒星的
    // 位置也冻在进入那一刻，行星和轨道盘就留在原地，镜头跟着恒星飞走 ——
    // 「恒星朝一个方向飞，行星和星盘都不跟着走」。
    const clock = planetOrbitClock({ elapsedMs: 9000, frozenAtMs: 4200, reducedMotion: false })
    expect(clock.frameTimeMs).toBe(9000)
    expect(clock.orbitTimeMs).toBe(4200)
  })

  it('uses one clock for both while nothing is frozen', () => {
    const clock = planetOrbitClock({ elapsedMs: 9000, frozenAtMs: null, reducedMotion: false })
    expect(clock.frameTimeMs).toBe(9000)
    expect(clock.orbitTimeMs).toBe(9000)
  })

  it('pins both to zero under reduced motion', () => {
    const clock = planetOrbitClock({ elapsedMs: 9000, frozenAtMs: 4200, reducedMotion: true })
    expect(clock).toEqual({ frameTimeMs: 0, orbitTimeMs: 0 })
  })
})
