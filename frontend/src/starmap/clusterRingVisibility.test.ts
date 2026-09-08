import { describe, expect, it } from 'vitest'
import {
  CLUSTER_RING_FADE_END,
  CLUSTER_RING_FADE_START,
  clusterRingOpacity,
} from './clusterRingVisibility'

/** 全景机位距离，两个渲染器同为 sceneRadius × 1.62。 */
const PANORAMA = 100

describe('cluster rings are a panorama-scale structure and must leave when you zoom in', () => {
  it('is fully lit at the panorama pose', () => {
    expect(clusterRingOpacity(PANORAMA, PANORAMA)).toBe(1)
  })

  it('stays fully lit when the camera pulls back beyond panorama', () => {
    expect(clusterRingOpacity(PANORAMA * 2.4, PANORAMA)).toBe(1)
  })

  it('is gone once the camera is closer than the fade-out distance', () => {
    expect(clusterRingOpacity(PANORAMA * CLUSTER_RING_FADE_END, PANORAMA)).toBe(0)
    expect(clusterRingOpacity(PANORAMA * 0.2, PANORAMA)).toBe(0)
    expect(clusterRingOpacity(0, PANORAMA)).toBe(0)
  })

  it('falls monotonically across the fade band without a step', () => {
    const samples = Array.from({ length: 21 }, (_, index) => {
      const factor = CLUSTER_RING_FADE_END
        + (CLUSTER_RING_FADE_START - CLUSTER_RING_FADE_END) * (index / 20)
      return clusterRingOpacity(PANORAMA * factor, PANORAMA)
    })
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!).toBeGreaterThanOrEqual(samples[index - 1]!)
      // 平滑：相邻采样之间不得出现台阶
      expect(samples[index]! - samples[index - 1]!).toBeLessThan(0.2)
    }
    expect(samples[0]).toBe(0)
    expect(samples[samples.length - 1]).toBe(1)
  })

  it('never returns a value outside [0,1] for degenerate input', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 0]) {
      const opacity = clusterRingOpacity(value, PANORAMA)
      expect(Number.isFinite(opacity)).toBe(true)
      expect(opacity).toBeGreaterThanOrEqual(0)
      expect(opacity).toBeLessThanOrEqual(1)
    }
  })

  it('falls back to fully lit when the panorama distance is unusable', () => {
    // 全景距离还没配置好时不能把环误伤成不可见 —— 那会让全景第一帧丢一层。
    for (const panorama of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(clusterRingOpacity(PANORAMA, panorama)).toBe(1)
    }
  })

  it('fades out before a focused star system fills the view', () => {
    // 聚焦恒星时相机半径最多是全景的 0.72 倍（framing 的上限钳位），
    // 典型值远小于此。淡出必须在这之前基本完成。
    expect(clusterRingOpacity(PANORAMA * 0.72, PANORAMA)).toBeLessThan(0.5)
  })
})
