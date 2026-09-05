// @vitest-environment node
import { describe, expect, test } from 'vitest'
import {
  PARITY_STATE_NAMES,
  compareFrameDescriptors,
  compareVisualParitySets,
  describeFrame,
} from './frameParity.mjs'

const WIDTH = 128
const HEIGHT = 72

/** Deterministic zero-mean noise so a "different GPU" run is reproducible in tests. */
function mulberry(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Paints a deep-space-like frame: an optional faint background wash (the layer
 * family Babylon dropped) plus a radial star whose skirt stands in for bloom.
 */
function paintFrame({
  width = WIDTH,
  height = HEIGHT,
  wash = 0,
  star = null,
  tint = [1, 1, 1],
} = {}) {
  const data = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = wash
      if (star) {
        const distance = Math.hypot(x - star.x, y - star.y) / star.radius
        if (distance <= 1) {
          const falloff = Math.pow(Math.max(0, 1 - distance), star.falloff ?? 2)
          value = Math.max(value, star.core * falloff)
        }
      }
      const offset = (y * width + x) * 4
      data[offset] = Math.round(Math.min(1, value * tint[0]) * 255)
      data[offset + 1] = Math.round(Math.min(1, value * tint[1]) * 255)
      data[offset + 2] = Math.round(Math.min(1, value * tint[2]) * 255)
      data[offset + 3] = 255
    }
  }
  return { width, height, data }
}

function withNoise(frame, amplitude = 3, seed = 20260904) {
  const random = mulberry(seed)
  const data = Uint8Array.from(frame.data)
  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const jitter = Math.round((random() * 2 - 1) * amplitude)
      data[index + channel] = Math.max(0, Math.min(255, data[index + channel] + jitter))
    }
  }
  return { ...frame, data }
}

function mirrored(frame) {
  const data = new Uint8Array(frame.data.length)
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const from = (y * frame.width + x) * 4
      const to = (y * frame.width + (frame.width - 1 - x)) * 4
      data.set(frame.data.subarray(from, from + 4), to)
    }
  }
  return { ...frame, data }
}

const referenceFrame = () => paintFrame({
  wash: 0.09,
  star: { x: 44, y: 30, radius: 26, core: 1, falloff: 1.6 },
})

const metricsOf = (result) => result.deviations.map(({ metric }) => metric)

describe('describeFrame', () => {
  test('reports the tone bands, structure grid and subject framing of a frame', () => {
    const descriptor = describeFrame(referenceFrame())

    expect(descriptor.width).toBe(WIDTH)
    expect(descriptor.height).toBe(HEIGHT)
    expect(descriptor.grid.length).toBeGreaterThanOrEqual(100)
    expect(descriptor.grid.every((value) => value >= 0 && value <= 1)).toBe(true)
    const bandTotal = Object.values(descriptor.toneBands).reduce((sum, value) => sum + value, 0)
    expect(bandTotal).toBeCloseTo(1, 6)
    expect(descriptor.coverage).toBeGreaterThan(0.5)
    expect(descriptor.subject.radius).toBeGreaterThan(0)
    expect(descriptor.subject.centroidX).toBeGreaterThan(0)
    expect(descriptor.subject.centroidX).toBeLessThan(1)
  })

  test('rejects frames whose buffer does not match the declared size', () => {
    expect(() => describeFrame({ width: 4, height: 4, data: new Uint8Array(8) }))
      .toThrow(/pixel buffer/i)
    expect(() => describeFrame({ width: 0, height: 4, data: new Uint8Array(0) }))
      .toThrow(/dimensions/i)
  })
})

describe('compareFrameDescriptors', () => {
  test('treats a frame as at parity with itself', () => {
    const descriptor = describeFrame(referenceFrame())

    const result = compareFrameDescriptors(descriptor, descriptor)

    expect(result.parity).toBe(true)
    expect(result.deviations).toEqual([])
  })

  test('tolerates per-pixel noise from a different GPU', () => {
    const reference = describeFrame(referenceFrame())
    const candidate = describeFrame(withNoise(referenceFrame(), 3))

    const result = compareFrameDescriptors(reference, candidate)

    expect(result.deviations).toEqual([])
    expect(result.parity).toBe(true)
  })

  test('fails when the bloom skirt around a bright core is gone', () => {
    const reference = describeFrame(paintFrame({
      star: { x: 64, y: 36, radius: 30, core: 1, falloff: 1.4 },
    }))
    // Same core, no glow: the skirt collapses into a hard-edged disc.
    const candidate = describeFrame(paintFrame({
      star: { x: 64, y: 36, radius: 12, core: 1, falloff: 0.05 },
    }))

    const result = compareFrameDescriptors(reference, candidate)

    expect(result.parity).toBe(false)
    expect(metricsOf(result)).toContain('toneBand:glow')
  })

  test('fails when the faint background layers are missing', () => {
    const reference = describeFrame(referenceFrame())
    const candidate = describeFrame(paintFrame({
      wash: 0,
      star: { x: 44, y: 30, radius: 26, core: 1, falloff: 1.6 },
    }))

    const result = compareFrameDescriptors(reference, candidate)

    expect(result.parity).toBe(false)
    expect(metricsOf(result)).toContain('toneBand:faint')
  })

  test('fails when the subject is framed far larger than the reference', () => {
    const reference = describeFrame(paintFrame({
      star: { x: 64, y: 36, radius: 10, core: 0.9, falloff: 1.5 },
    }))
    const candidate = describeFrame(paintFrame({
      star: { x: 64, y: 36, radius: 30, core: 0.9, falloff: 1.5 },
    }))

    const result = compareFrameDescriptors(reference, candidate)

    expect(result.parity).toBe(false)
    expect(metricsOf(result)).toContain('subject:radius')
  })

  test('fails on a relocated subject even though every global ratio is identical', () => {
    const source = paintFrame({ wash: 0.09, star: { x: 30, y: 30, radius: 22, core: 1, falloff: 1.6 } })
    const reference = describeFrame(source)
    const candidate = describeFrame(mirrored(source))

    // Mirroring preserves the histogram exactly, so a ratio-only gate cannot see it.
    expect(candidate.coverage).toBeCloseTo(reference.coverage, 10)
    for (const band of Object.keys(reference.toneBands)) {
      expect(candidate.toneBands[band]).toBeCloseTo(reference.toneBands[band], 10)
    }

    const result = compareFrameDescriptors(reference, candidate)

    expect(result.parity).toBe(false)
    expect(metricsOf(result)).toContain('structure:tileMax')
  })

  test('fails on a colour cast even when luminance structure is preserved', () => {
    const reference = describeFrame(paintFrame({
      wash: 0.09, star: { x: 44, y: 30, radius: 26, core: 0.8, falloff: 1.6 },
    }))
    const candidate = describeFrame(paintFrame({
      wash: 0.09, star: { x: 44, y: 30, radius: 26, core: 0.8, falloff: 1.6 }, tint: [1, 0.55, 0.2],
    }))

    const result = compareFrameDescriptors(reference, candidate)

    expect(result.parity).toBe(false)
    expect(metricsOf(result)).toContain('chroma')
  })

  test('reports deviations ordered by how far past tolerance they are', () => {
    const reference = describeFrame(referenceFrame())
    const candidate = describeFrame(paintFrame({
      wash: 0, star: { x: 96, y: 20, radius: 8, core: 1, falloff: 0.05 },
    }))

    const result = compareFrameDescriptors(reference, candidate)

    expect(result.deviations.length).toBeGreaterThan(1)
    const severities = result.deviations.map(({ delta, allowed }) => delta / allowed)
    expect([...severities].sort((left, right) => right - left)).toEqual(severities)
    for (const deviation of result.deviations) {
      expect(deviation).toHaveProperty('reference')
      expect(deviation).toHaveProperty('candidate')
      expect(deviation.delta).toBeGreaterThan(deviation.allowed)
    }
  })

  test('refuses to compare frames captured at different viewport sizes', () => {
    const reference = describeFrame(paintFrame({ star: { x: 44, y: 30, radius: 26, core: 1 } }))
    const candidate = describeFrame(paintFrame({
      width: 160, height: 90, star: { x: 44, y: 30, radius: 26, core: 1 },
    }))

    expect(() => compareFrameDescriptors(reference, candidate)).toThrow(/viewport/i)
  })

  test('does not rely on coverage alone to decide parity', () => {
    const reference = describeFrame(paintFrame({
      wash: 0.09, star: { x: 30, y: 36, radius: 20, core: 1, falloff: 1.6 },
    }))
    const candidate = describeFrame(paintFrame({
      wash: 0.09, star: { x: 98, y: 36, radius: 20, core: 1, falloff: 1.6 },
    }))

    const result = compareFrameDescriptors(reference, candidate)

    expect(Math.abs(candidate.coverage - reference.coverage)).toBeLessThan(0.005)
    expect(metricsOf(result)).not.toContain('coverage')
    expect(result.parity).toBe(false)
  })
})

describe('compareVisualParitySets', () => {
  const parityDescriptors = () => Object.fromEntries(
    PARITY_STATE_NAMES.map((name, index) => [
      name,
      describeFrame(paintFrame({
        wash: 0.09,
        star: { x: 40 + index * 8, y: 30, radius: 20 + index * 4, core: 0.95, falloff: 1.6 },
      })),
    ]),
  )

  test('covers panorama, focused-star and planet-focus', () => {
    expect([...PARITY_STATE_NAMES]).toEqual(['panorama', 'focused-star', 'planet-focus'])
  })

  test('passes when every captured state matches', () => {
    const reference = parityDescriptors()
    const candidate = parityDescriptors()

    const result = compareVisualParitySets(reference, candidate)

    expect(result.parity).toBe(true)
    expect(result.states.map(({ name }) => name)).toEqual([...PARITY_STATE_NAMES])
    expect(result.failedStates).toEqual([])
  })

  test('names the state that broke parity', () => {
    const reference = parityDescriptors()
    const candidate = parityDescriptors()
    candidate['planet-focus'] = describeFrame(paintFrame({
      wash: 0, star: { x: 64, y: 36, radius: 34, core: 0.95, falloff: 0.1 },
    }))

    const result = compareVisualParitySets(reference, candidate)

    expect(result.parity).toBe(false)
    expect(result.failedStates).toEqual(['planet-focus'])
    const failed = result.states.find(({ name }) => name === 'planet-focus')
    expect(failed.deviations.length).toBeGreaterThan(0)
  })

  test('refuses to pass when a required state was never captured', () => {
    const reference = parityDescriptors()
    const candidate = parityDescriptors()
    delete candidate['focused-star']

    expect(() => compareVisualParitySets(reference, candidate)).toThrow(/focused-star/)
  })
})
