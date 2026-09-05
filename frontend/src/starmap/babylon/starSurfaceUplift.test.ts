import { describe, expect, it } from 'vitest'
import { starColor, temperature } from '../gl/blackbody'
import { babylonCinematicEnvironment } from './cinematic'
import { displayContrast, perceivedLuminance } from './toneResponse'
import {
  STAR_LIMB_TEMPERATURE_RATIO,
  STAR_UMBRA_FLOOR,
  starLimbTemperature,
  starSurfaceRadiance,
  starTemperatureLayers,
} from './stellarRadiance'
import { starSurfaceFragmentShader } from './shaders/starSurface.fragment.fx'

const COLOR = starColor(218, 70)
const KELVIN = temperature(218, 70)
const THRESHOLD = babylonCinematicEnvironment('high').bloomThreshold

const sample = (overrides: Partial<Parameters<typeof starSurfaceRadiance>[0]> = {}) =>
  starSurfaceRadiance({
    kelvin: KELVIN, color: COLOR, facing: 1, granulation: 0.5, cellular: 0.5, activity: 0,
    ...overrides,
  })

describe('star surface: a body, not a white blob', () => {
  it('renders granulation with enough range that lanes survive the tone curve', () => {
    // 恢复批次的表面在 detail 0.62–1.16 之间起伏，显示端实测对比度
    // **0.0153** —— 全部落在 KHR Neutral 的压缩段里，观众看到的是同一块白。
    // 提升后跨度 0.34–1.44，显示端 0.108，约 7 倍。
    const bright = sample({ granulation: 1, cellular: 1 })
    const lane = sample({ granulation: 0, cellular: 0 })
    expect(displayContrast(bright, lane)).toBeGreaterThan(0.09)
  })

  it('drops a starspot umbra deep enough to read as a hole in the photosphere', () => {
    const photosphere = sample()
    const umbra = sample({ spot: 1 })
    expect(displayContrast(photosphere, umbra)).toBeGreaterThan(0.55)
    // 本影不能是纯黑：真实黑子仍有约 20–30% 的辐亮度。
    expect(perceivedLuminance(umbra)).toBeGreaterThan(0.04)
    expect(STAR_UMBRA_FLOOR).toBeGreaterThan(0)
    expect(STAR_UMBRA_FLOOR).toBeLessThan(0.35)
  })

  it('keeps the penumbra between the umbra and the quiet photosphere', () => {
    const quiet = perceivedLuminance(sample())
    const penumbra = perceivedLuminance(sample({ spot: 0.45 }))
    const umbra = perceivedLuminance(sample({ spot: 1 }))
    expect(penumbra).toBeLessThan(quiet)
    expect(penumbra).toBeGreaterThan(umbra)
  })

  it('stratifies colour temperature: the limb is cooler and redder than the core', () => {
    const layers = starTemperatureLayers(KELVIN)
    expect(layers.core).toBeGreaterThan(layers.photosphere)
    expect(layers.photosphere).toBeGreaterThan(layers.limb)
    expect(starLimbTemperature(KELVIN)).toBeCloseTo(KELVIN * STAR_LIMB_TEMPERATURE_RATIO, 6)

    const core = sample({ facing: 1 })
    const limb = sample({ facing: 0.06 })
    const warmth = (rgb: readonly [number, number, number]) => rgb[0] / Math.max(rgb[2], 1e-6)
    expect(warmth(limb)).toBeGreaterThan(warmth(core) * 1.15)
  })

  it('still clears the restoration gate: the whole disc glows', () => {
    // 恢复门禁不得放宽 —— 中心 > 3 倍阈值、边缘仍在阈值之上、单调下降。
    const luminance = (facing: number) => {
      const rgb = sample({ facing })
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
    }
    expect(luminance(1)).toBeGreaterThan(THRESHOLD * 3)
    expect(luminance(0.15)).toBeGreaterThan(THRESHOLD)
    expect(luminance(0)).toBeGreaterThan(THRESHOLD)
    const ladder = [1, 0.75, 0.5, 0.25, 0].map(luminance)
    for (let index = 1; index < ladder.length; index += 1) {
      expect(ladder[index]!).toBeLessThan(ladder[index - 1]!)
    }
  })

  it('brightens faculae towards the limb, where real plage is visible', () => {
    const quietLimb = perceivedLuminance(sample({ facing: 0.2 }))
    const plageLimb = perceivedLuminance(sample({ facing: 0.2, facula: 1 }))
    const quietCentre = perceivedLuminance(sample({ facing: 1 }))
    const plageCentre = perceivedLuminance(sample({ facing: 1, facula: 1 }))
    expect(plageLimb - quietLimb).toBeGreaterThan(0.02)
    expect(plageLimb - quietLimb).toBeGreaterThan(plageCentre - quietCentre)
  })

  it('never lets the whole disc clip to display white', () => {
    // 本批次的标题主张，写成可回归的形式。
    //
    // 按**圆面面积**均匀采样（μ = √(1−r²)，r² 均匀），再过一遍显示端色调曲线：
    //
    //   | | 落在 ≥ 0.85 显示亮度的样本 | 显示亮度跨度 |
    //   |---|---:|---:|
    //   | 提升前（detail 0.62–1.16、无星斑、无色温分层） | **0.9654** | 0.4431 |
    //   | 提升后 | **0.5339** | 0.9763 |
    //
    // 实拍旁证（1280×720，圆面内 60×60 窗口）：三通道都 ≥ 250 的像素占比
    // 提升前 **44.89%**、提升后 **0.00%**。
    const sweep: number[] = []
    for (let step = 0; step <= 20; step += 1) {
      const facing = Math.sqrt(1 - step / 20)
      for (let granulation = 0; granulation <= 1.0001; granulation += 0.1) {
        for (const spot of [0, 0.35, 0.8]) {
          sweep.push(perceivedLuminance(
            sample({ facing, granulation, cellular: granulation, spot }),
          ))
        }
      }
    }
    const blown = sweep.filter((value) => value >= 0.85).length / sweep.length
    expect(blown).toBeLessThan(0.7)
    expect(Math.max(...sweep) - Math.min(...sweep)).toBeGreaterThan(0.8)
  })

  it('declares every uplift uniform to the shader', () => {
    for (const uniform of [
      'uniform vec3 uLimbColor', 'uniform vec3 uCoreColor', 'uniform float uSpotCount',
      'uniform float uSpotStrength', 'uniform float uSupergranulation',
    ]) {
      expect(starSurfaceFragmentShader).toContain(uniform)
    }
  })
})
