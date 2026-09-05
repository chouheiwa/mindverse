import { describe, expect, it } from 'vitest'
import { QUALITY_LEVELS } from '../quality'
import { babylonUpliftTier } from './visualUplift'
import {
  PROBE_SCAN_SWEEP_SPAN,
  probeAccentLights,
  probeScanSweep,
  probeThrusterPlume,
} from './probeCinematics'

describe('probe accent lighting', () => {
  it('gives every tier at least a key accent and never more than the budget', () => {
    for (const quality of QUALITY_LEVELS) {
      const tier = babylonUpliftTier(quality)
      const lights = probeAccentLights(tier)
      expect(lights.length).toBe(tier.probeAccentLights)
      expect(lights.length).toBeGreaterThan(0)
    }
  })

  it('keeps the three-point rig in order: key warm, fill cool, rim behind', () => {
    const lights = probeAccentLights(babylonUpliftTier('high'))
    const [key, fill, rim] = lights
    // 暖主光 + 冷补光是「电影式」的全部内容 —— 单一白光下的金属永远是灰的。
    expect(key!.color[0]).toBeGreaterThan(key!.color[2])
    expect(fill!.color[2]).toBeGreaterThan(fill!.color[0])
    // 轮廓光在机体背后：它勾出剪影，所以必须在负 z 一侧。
    expect(rim!.position[2]).toBeLessThan(0)
    expect(key!.intensity).toBeGreaterThan(fill!.intensity)
  })

  it('drops the rim before the fill and the fill before the key as tiers fall', () => {
    const high = probeAccentLights(babylonUpliftTier('high')).map(({ role }) => role)
    const medium = probeAccentLights(babylonUpliftTier('medium')).map(({ role }) => role)
    const low = probeAccentLights(babylonUpliftTier('low')).map(({ role }) => role)
    expect(high).toEqual(['key', 'fill', 'rim'])
    expect(medium).toEqual(['key', 'fill'])
    expect(low).toEqual(['key'])
  })
})

describe('probe thruster plume', () => {
  it('is idle-bright but never dark, so the ship reads as powered on', () => {
    const idle = probeThrusterPlume({ elapsedMs: 0, throttle: 0, reducedMotion: false })
    expect(idle.intensity).toBeGreaterThan(0)
    expect(idle.length).toBeGreaterThan(0)
  })

  it('lengthens and brightens with throttle', () => {
    const idle = probeThrusterPlume({ elapsedMs: 0, throttle: 0, reducedMotion: false })
    const burn = probeThrusterPlume({ elapsedMs: 0, throttle: 1, reducedMotion: false })
    expect(burn.length).toBeGreaterThan(idle.length * 1.5)
    expect(burn.intensity).toBeGreaterThan(idle.intensity)
  })

  it('flickers over time unless reduced motion is on', () => {
    const inputs = { throttle: 0.5, reducedMotion: false }
    const samples = [0, 120, 240, 360].map(
      (elapsedMs) => probeThrusterPlume({ ...inputs, elapsedMs }).intensity,
    )
    expect(new Set(samples.map((value) => value.toFixed(4))).size).toBeGreaterThan(1)

    const still = [0, 120, 240].map(
      (elapsedMs) => probeThrusterPlume({ throttle: 0.5, reducedMotion: true, elapsedMs }).intensity,
    )
    expect(new Set(still).size).toBe(1)
  })

  it('stays warm at the core and cools outward like a real plume', () => {
    const plume = probeThrusterPlume({ elapsedMs: 0, throttle: 1, reducedMotion: false })
    expect(plume.coreColor[0]).toBeGreaterThan(plume.edgeColor[0])
    expect(plume.edgeColor[2]).toBeGreaterThan(plume.coreColor[2])
  })
})

describe('probe scan sweep', () => {
  it('travels the hull once across the scan, nose to tail', () => {
    expect(probeScanSweep(0).position).toBeLessThan(probeScanSweep(0.5).position)
    expect(probeScanSweep(0.5).position).toBeLessThan(probeScanSweep(1).position)
    expect(probeScanSweep(0).position).toBeCloseTo(-PROBE_SCAN_SWEEP_SPAN, 6)
    expect(probeScanSweep(1).position).toBeCloseTo(PROBE_SCAN_SWEEP_SPAN, 6)
  })

  it('fades in and out so the sweep never pops on at full strength', () => {
    expect(probeScanSweep(0).opacity).toBeLessThan(probeScanSweep(0.5).opacity)
    expect(probeScanSweep(1).opacity).toBeLessThan(probeScanSweep(0.5).opacity)
  })

  it('is inert outside the scan window', () => {
    expect(probeScanSweep(-1).opacity).toBe(0)
    expect(probeScanSweep(2).opacity).toBe(0)
    expect(probeScanSweep(Number.NaN).opacity).toBe(0)
  })
})
