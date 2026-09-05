import { describe, expect, it } from 'vitest'
import { displayLuminance, toneMapNeutral, TONE_EXPOSURE } from './toneResponse'

describe('KHR PBR Neutral tone response mirror', () => {
  it('passes dark values through the linear segment, minus the KHR black offset', () => {
    // KHR Neutral 对 >= 0.08 的最暗通道恒减 0.04：这是它的阴影抬压，
    // 不是实现走样。镜像必须照抄，否则暗部对比度会被算高。
    const [red, green, blue] = toneMapNeutral([0.2, 0.2, 0.2])
    const expected = 0.2 * TONE_EXPOSURE - 0.04
    expect(red).toBeCloseTo(expected, 5)
    expect(green).toBeCloseTo(expected, 5)
    expect(blue).toBeCloseTo(expected, 5)
  })

  it('never exceeds display white', () => {
    for (const value of [1, 2, 4, 6, 40]) {
      for (const channel of toneMapNeutral([value, value, value])) {
        expect(channel).toBeLessThanOrEqual(1)
      }
    }
  })

  it('compresses the highlights so structure above ~1.5 is lost', () => {
    // 这条用例是整批提升的物理依据：KHR Neutral 在 HDR 1.5 之上只剩
    // 0.05 的显示动态范围。想让恒星表面「有结构」，结构就必须住在暗侧，
    // 而不是靠把亮部推得更亮。
    const bright = displayLuminance(toneMapNeutral([1.5, 1.5, 1.5]))
    const blazing = displayLuminance(toneMapNeutral([6, 6, 6]))
    expect(blazing - bright).toBeLessThan(0.08)
    const shadow = displayLuminance(toneMapNeutral([0.35, 0.35, 0.35]))
    expect(bright - shadow).toBeGreaterThan(0.4)
  })

  it('increases monotonically with scene radiance', () => {
    const ladder = [0, 0.1, 0.3, 0.6, 1, 2, 5].map(
      (value) => displayLuminance(toneMapNeutral([value, value, value])),
    )
    for (let index = 1; index < ladder.length; index += 1) {
      expect(ladder[index]!).toBeGreaterThan(ladder[index - 1]!)
    }
  })

  it('desaturates as it compresses, which is why colour has to live in the mid tones', () => {
    const warmDark = toneMapNeutral([0.5, 0.3, 0.12])
    const warmBlazing = toneMapNeutral([5, 3, 1.2])
    const saturation = (rgb: readonly [number, number, number]) =>
      (Math.max(...rgb) - Math.min(...rgb)) / Math.max(Math.max(...rgb), 1e-6)
    expect(saturation(warmDark)).toBeGreaterThan(saturation(warmBlazing) * 1.5)
  })
})
