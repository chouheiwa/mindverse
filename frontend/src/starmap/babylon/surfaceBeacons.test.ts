import { describe, expect, it } from 'vitest'
import { surfaceBeaconsFor } from './surfaceBeacons'

// 站在球上也要能回答「它和谁连着」：同恒星系的其他问题挂在天上（按真实方向），
// 有虫洞通向的星群用另一种颜色标出来。
const unit = (v: readonly number[]) => Math.hypot(v[0]!, v[1]!, v[2]!)

describe('surface beacons', () => {
  const clusters = [
    { g: 3, name: 'AI编程', lead: '', c: [0, 0, 0] as [number, number, number], n: 1, o: 0, f: 0, hue: 0, sat: 0, mem: [] },
    { g: 5, name: '正则', lead: '', c: [10, 0, 0] as [number, number, number], n: 1, o: 0, f: 0, hue: 0, sat: 0, mem: [] },
    { g: 9, name: '无关', lead: '', c: [0, 10, 0] as [number, number, number], n: 1, o: 0, f: 0, hue: 0, sat: 0, mem: [] },
  ]
  const wormholes = [
    { a: 3, b: 5, an: 'AI编程', bn: '正则', obs: 1, exp: 0, z: -3, ev: [] },
    { a: 7, b: 9, an: 'x', bn: '无关', obs: 1, exp: 0, z: -3, ev: [] },
  ]
  const input = {
    centre: [1, 0, 0] as const,
    questionId: 'question:7',
    clusterId: 3,
    siblings: [
      { questionId: 'question:7', starId: 'star:a', title: '自己', position: [2, 0, 0] as const },
      { questionId: 'question:8', starId: 'star:a', title: '为什么大语言模型能写正则表达式？这个标题很长很长', position: [1, 2, 0] as const },
      { questionId: 'question:9', starId: 'star:a', title: '重合', position: [1, 0, 0] as const },
    ],
    clusters, wormholes,
  }

  it('points at every sibling except yourself, and at the far side of each wormhole from your cluster', () => {
    const beacons = surfaceBeaconsFor(input)
    expect(beacons.map(({ kind, key }) => [kind, key])).toEqual([
      ['planet', 'question:8'],
      ['wormhole', 'wormhole:0'],
    ])
    const sibling = beacons[0]!
    expect(sibling.direction).toEqual([0, 1, 0])
    expect(unit(sibling.direction)).toBeCloseTo(1, 9)
    // 标题太长截断，天上挂不下一整句。
    expect(sibling.label.length).toBeLessThanOrEqual(19)
    expect(sibling.label.endsWith('…')).toBe(true)
    const wormhole = beacons[1]!
    expect(wormhole.label).toBe('→ 正则')
    expect(wormhole.wormholeIndex).toBe(0)
    expect(wormhole.direction[0]).toBeGreaterThan(0.99)
  })

  it('lifts neighbours below the horizon up into the sky, keeping their bearing', () => {
    // 邻居在轨道面上，一半在地平线以下 —— 看不见的信标没用。方位保持真实，高度抬到 12°。
    // 邻居正在地平线上（方向 +Y，脚下法线 +X）：抬到 12°。
    const beacons = surfaceBeaconsFor({ ...input, up: [1, 0, 0] })
    const sibling = beacons[0]!
    expect(sibling.direction[0]).toBeCloseTo(Math.sin(Math.PI * 12 / 180), 6)
    expect(sibling.direction[1]).toBeCloseTo(Math.cos(Math.PI * 12 / 180), 6)
    expect(unit(sibling.direction)).toBeCloseTo(1, 9)
    // 已经在天上的不动。
    const above = surfaceBeaconsFor({ ...input, up: [0, 1, 0] })[0]!
    expect(above.direction).toEqual([0, 1, 0])
  })

  it('has nothing to say on a lonely planet', () => {
    expect(surfaceBeaconsFor({ ...input, siblings: [input.siblings[0]!], wormholes: [], clusterId: 42 })).toEqual([])
  })
})
