import { describe, expect, it } from 'vitest'
import { compareUplift, describeUplift, UPLIFT_DIRECTIONS } from './upliftMetrics.mjs'

function frame(width, height, paint) {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = paint(x, y)
      const offset = (y * width + x) * 4
      data[offset] = red
      data[offset + 1] = green
      data[offset + 2] = blue
      data[offset + 3] = 255
    }
  }
  return { width, height, data }
}

const FLAT_WHITE = frame(64, 64, () => [255, 255, 255])
const CHECKER = frame(64, 64, (x, y) => {
  const level = (x + y) % 2 === 0 ? 60 : 200
  return [level, level, level]
})
const DARK = frame(64, 64, () => [4, 4, 4])

describe('uplift metrics', () => {
  it('scores a flat white blob as overexposed with no detail and no legibility', () => {
    const metrics = describeUplift(FLAT_WHITE)
    expect(metrics.clippedWhite).toBe(1)
    expect(metrics.detailDensity).toBeCloseTo(0, 6)
    expect(metrics.subjectLegibility).toBe(0)
    expect(metrics.rmsContrast).toBeCloseTo(0, 6)
  })

  it('scores a textured surface as detailed, contrasty and legible', () => {
    const metrics = describeUplift(CHECKER)
    expect(metrics.detailDensity).toBeGreaterThan(0.3)
    expect(metrics.rmsContrast).toBeGreaterThan(0.4)
    expect(metrics.subjectLegibility).toBeGreaterThan(0.9)
    expect(metrics.clippedWhite).toBe(0)
  })

  it('treats a near-black frame as background, not as a subject', () => {
    const metrics = describeUplift(DARK)
    expect(metrics.foregroundRatio).toBe(0)
    expect(metrics.rmsContrast).toBe(0)
    expect(metrics.detailDensity).toBe(0)
  })

  it('measures legibility inside the region it is given', () => {
    // 左半白、右半灰：整帧可辨识，但只看左半边就是一块平色。
    const split = frame(64, 64, (x) => (x < 32 ? [255, 255, 255] : [128, 128, 128]))
    expect(describeUplift(split).subjectLegibility).toBe(1)
    expect(describeUplift(split, { x: 0, y: 0, width: 16, height: 64 }).subjectLegibility).toBe(0)
  })

  it('clamps a region that runs off the frame instead of reading out of bounds', () => {
    const metrics = describeUplift(CHECKER, { x: 60, y: 60, width: 400, height: 400 })
    expect(Number.isFinite(metrics.subjectLegibility)).toBe(true)
    expect(metrics.subjectLegibility).toBeGreaterThanOrEqual(0)
    expect(metrics.subjectLegibility).toBeLessThanOrEqual(1)
  })

  it('reports colour spread only over foreground pixels', () => {
    const warm = frame(32, 32, () => [220, 120, 40])
    const grey = frame(32, 32, () => [160, 160, 160])
    expect(describeUplift(warm).colorSpread).toBeGreaterThan(describeUplift(grey).colorSpread)
  })

  it('rejects a malformed frame rather than returning plausible garbage', () => {
    expect(() => describeUplift(null)).toThrow(TypeError)
    expect(() => describeUplift({ width: 0, height: 0, data: new Uint8ClampedArray() }))
      .toThrow(RangeError)
    expect(() => describeUplift({ width: 2, height: 2, data: new Uint8ClampedArray(4) }))
      .toThrow(RangeError)
  })

  it('knows which direction counts as an improvement for each metric', () => {
    const rows = compareUplift(describeUplift(FLAT_WHITE), describeUplift(CHECKER))
    const byMetric = new Map(rows.map((row) => [row.metric, row]))
    expect(byMetric.get('detailDensity').improved).toBe(true)
    expect(byMetric.get('clippedWhite').improved).toBe(true)
    expect(byMetric.get('foregroundRatio').improved).toBe(null)
    expect(new Set(Object.values(UPLIFT_DIRECTIONS)))
      .toEqual(new Set(['higher', 'lower', 'neutral']))
  })
})
