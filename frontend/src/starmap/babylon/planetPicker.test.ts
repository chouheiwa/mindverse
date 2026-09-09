import { describe, expect, it } from 'vitest'
import { pickProjectedStar, type ProjectedStarCandidate } from './starPicker'

// 行星复用恒星那套邻近拾取。这组用例钉的是「行星也享有同样的容差」这条契约 ——
// 在此之前行星走 scene.pick，逐像素打在网格上：球在屏幕上多小，可点区域就多小，
// 瞄准差几像素就被判成「点了空白」，然后被弹回宇宙。

const viewport = { width: 1280, height: 720 }
const planet = (over: Partial<ProjectedStarCandidate> = {}): ProjectedStarCandidate => ({
  starKey: 'planet:question:7', x: 640, y: 360, depth: 0.5, visualRadiusPx: 3, visible: true, ...over,
})

describe('a small planet must still be clickable', () => {
  it('accepts a near miss on a three-pixel planet with a mouse', () => {
    // 3px 的球，鼠标点在 9px 外 —— 以前必然落空并触发退出。
    const hit = pickProjectedStar({ x: 649, y: 360, inputKind: 'mouse', viewport }, [planet()])
    expect(hit?.starKey).toBe('planet:question:7')
  })

  it('is even more forgiving under a finger', () => {
    const touch = pickProjectedStar({ x: 660, y: 360, inputKind: 'touch', viewport }, [planet()])
    expect(touch?.starKey).toBe('planet:question:7')
    // 同样的距离用鼠标就不该命中 —— 容差是按输入方式分的，不是一刀切放大。
    expect(pickProjectedStar({ x: 660, y: 360, inputKind: 'mouse', viewport }, [planet()])).toBeNull()
  })

  it('still misses when the click is genuinely far away', () => {
    // 真的点在空白处仍然要判空 —— 否则退出就没法用了。
    expect(pickProjectedStar({ x: 900, y: 360, inputKind: 'mouse', viewport }, [planet()])).toBeNull()
    expect(pickProjectedStar({ x: 900, y: 360, inputKind: 'touch', viewport }, [planet()])).toBeNull()
  })

  it('picks the nearer of two crowded planets', () => {
    const chosen = pickProjectedStar({ x: 648, y: 360, inputKind: 'mouse', viewport }, [
      planet({ starKey: 'planet:a', x: 640 }),
      planet({ starKey: 'planet:b', x: 652 }),
    ])
    expect(chosen?.starKey).toBe('planet:b')
  })

  it('ignores a planet that is not currently interactive', () => {
    expect(pickProjectedStar(
      { x: 640, y: 360, inputKind: 'mouse', viewport }, [planet({ visible: false })],
    )).toBeNull()
  })

  it('ignores a planet behind the camera', () => {
    for (const depth of [-0.1, 1.2]) {
      expect(pickProjectedStar(
        { x: 640, y: 360, inputKind: 'mouse', viewport }, [planet({ depth })],
      )).toBeNull()
    }
  })

  it('keeps a near-miss margin on a big planet instead of capping at the star halo limit', () => {
    // 恒星的拾取半径封顶 28px 是为了不让光晕吃掉相邻的星；行星没有光晕，
    // 实体球有多大，容差就该在球外再留一圈 —— 否则球越大反而越难点：
    // 实测 77px 的球，点在边缘外 8px 直接判空，把人从行星上踢下来。
    const big = planet({ visualRadiusPx: 38.7, solid: true })
    expect(pickProjectedStar({ x: 640 + 38.7 + 8, y: 360, inputKind: 'mouse', viewport }, [big])?.starKey)
      .toBe('planet:question:7')
    expect(pickProjectedStar({ x: 640 + 38.7 + 20, y: 360, inputKind: 'touch', viewport }, [big])?.starKey)
      .toBe('planet:question:7')
    // 鼠标的余量仍然按鼠标算，不能借手指的。
    expect(pickProjectedStar({ x: 640 + 38.7 + 20, y: 360, inputKind: 'mouse', viewport }, [big])).toBeNull()
  })

  it('leaves star tolerance untouched', () => {
    const star = planet({ starKey: 'star', visualRadiusPx: 38.7 })
    expect(pickProjectedStar({ x: 640 + 30, y: 360, inputKind: 'mouse', viewport }, [star])).toBeNull()
  })
})
