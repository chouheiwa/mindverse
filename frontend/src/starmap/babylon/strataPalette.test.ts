import { describe, expect, it } from 'vitest'
import {
  LAMINATION_HEIGHT,
  LAMINATION_TEXTURE_HEIGHT,
  laminationProfile,
  CAVE_LIGHT_INTENSITY,
  CAVE_LIGHT_RANGE,
  SEAM_EMISSIVE,
  SEAM_THICKNESS,
  adjacentLayerContrast,
  layerBaseColor,
  layerEmissive,
} from './strataPalette'

const luminance = (color: readonly [number, number, number]) =>
  color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722

describe('strata palette', () => {
  it('separates adjacent layers enough to read as strata', () => {
    for (let index = 0; index < 8; index += 1) {
      // 迁移版所有层同一个 0.36 增益，比值恒为 1 —— 洞里看不出层。
      expect(adjacentLayerContrast(index)).toBeGreaterThan(1.6)
    }
  })

  it('keeps every layer above the frame-parity background floor', () => {
    for (let index = 0; index < 8; index += 1) {
      // 12/255 是门禁判定「背景」的阈值；层面必须明确高于它。
      expect(luminance(layerEmissive(index))).toBeGreaterThan(0.06)
      expect(luminance(layerEmissive(index))).toBeLessThan(0.42)
    }
  })

  it('makes the seam the brightest thing in the shaft', () => {
    for (let index = 0; index < 4; index += 1) {
      expect(luminance(SEAM_EMISSIVE)).toBeGreaterThan(luminance(layerEmissive(index)) * 2)
    }
    // 0.10 在半径 4.8 的竖井里不到两个像素高。
    expect(SEAM_THICKNESS).toBeGreaterThanOrEqual(0.2)
  })

  it('cycles four sedimentary hues and survives hostile indices', () => {
    expect(layerBaseColor(0)).not.toEqual(layerBaseColor(1))
    expect(layerBaseColor(4)).toEqual(layerBaseColor(0))
    expect(layerBaseColor(-3)).toEqual(layerBaseColor(3))
    expect(layerBaseColor(Number.NaN)).toEqual(layerBaseColor(0))
    expect(layerEmissive(Number.NaN).every(Number.isFinite)).toBe(true)
  })

  it('gives each layer visible internal laminations', () => {
    const profile = laminationProfile()
    expect(profile).toHaveLength(LAMINATION_TEXTURE_HEIGHT)
    const min = Math.min(...profile)
    const max = Math.max(...profile)
    // 层厚是 4–18 个世界单位、竖井半径只有 4.8：一屏装不下两层，
    // 所以「地层感」必须由层内部的纹层提供。
    expect(max - min).toBeGreaterThan(0.4)
    expect(min).toBeGreaterThan(0.05)
    expect(max).toBeLessThanOrEqual(1)
    // 至少八个明暗交替，不是一条渐变。
    let crossings = 0
    const mid = (min + max) / 2
    for (let row = 1; row < profile.length; row += 1) {
      if ((profile[row - 1]! - mid) * (profile[row]! - mid) < 0) crossings += 1
    }
    expect(crossings).toBeGreaterThanOrEqual(8)
  })

  it('sizes a lamination so it reads from across the shaft', () => {
    // 4.8 远、60° 视场下一屏纵向约 5.5 个单位；1.05 的纹层约占五分之一屏。
    expect(LAMINATION_HEIGHT).toBeGreaterThan(0.6)
    expect(LAMINATION_HEIGHT).toBeLessThan(2)
  })

  it('lights the shaft far enough to reach its wall', () => {
    // 竖井半径 4.8，灯放在 ±2.4：range 9 时对面墙已经衰减到几乎没有。
    expect(CAVE_LIGHT_RANGE).toBeGreaterThan(4.8 + 2.4)
    expect(CAVE_LIGHT_INTENSITY).toBeGreaterThan(1)
  })
})
