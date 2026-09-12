import { describe, expect, it } from 'vitest'
import { layoutSurfaceMarks, surfaceMarksFor, type SurfaceMarkKind } from './surfaceMarks'
import type { Vec3 } from './cubeSphere'

// 落地第一眼该看到「我和这颗星球的关系」：你创作的回答是插在地上的旗，收藏的是石堆，
// 就在落点前方视野里，走过去能点开原文。地层保留给「别人怎么回答的年代史」。
const unit = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

describe('surface marks', () => {
  it('turns your bindings into flags (created) and cairns (collected), nothing else', () => {
    const marks = surfaceMarksFor([
      { id: 'answer:1', bindings: [{ relation: 'created' }] },
      { id: 'answer:2', bindings: [{ relation: 'collected' }, { relation: 'created' }] },
      { id: 'answer:3', bindings: [] },
      { id: 'answer:4', bindings: [{ relation: 'collected' }] },
    ])
    expect(marks).toEqual([
      { answerId: 'answer:1', kind: 'flag' },
      { answerId: 'answer:2', kind: 'flag' },
      { answerId: 'answer:4', kind: 'cairn' },
    ] satisfies { answerId: string; kind: SurfaceMarkKind }[])
  })

  it('fans the marks out ahead of the landing site, inside the horizon and off the eye', () => {
    const landing: Vec3 = [0, 1, 0]
    const facing: Vec3 = [0, 0, 1]
    const placements = layoutSurfaceMarks(landing, facing, Array.from({ length: 7 }, (_, i) => ({ answerId: `a:${i}`, kind: i % 2 ? 'cairn' : 'flag' } as const)))
    expect(placements).toHaveLength(7)
    // 第一枚正前方：落地那一眼就在视野正中，不在画面外。
    const right: Vec3 = [1, 0, 0]
    expect(Math.abs(dot(placements[0]!.direction, right))).toBeLessThan(1e-6)
    for (const mark of placements) {
      expect(unit(mark.direction)).toBeCloseTo(1, 9)
      const angle = Math.acos(Math.min(1, dot(mark.direction, landing)))
      // 眼高 0.012R 的地平线在 0.155 rad；标记要在 0.03–0.11 rad 之间：看得见、不在脚下。
      expect(angle).toBeGreaterThan(0.03)
      expect(angle).toBeLessThan(0.11)
      // 在前方（朝向）的半平面里，不在身后。
      expect(dot(mark.direction, facing)).toBeGreaterThan(0)
    }
    // 彼此不挤：任意两枚的角距离大于 0.012 rad。
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        expect(Math.acos(Math.min(1, dot(placements[i]!.direction, placements[j]!.direction)))).toBeGreaterThan(0.012)
      }
    }
  })

  it('can swing the whole fan aside so the first flag does not stand on the signpost', () => {
    const facing: Vec3 = [0, 0, 1]
    const right: Vec3 = [1, 0, 0]
    const swung = layoutSurfaceMarks([0, 1, 0], facing, [{ answerId: 'a', kind: 'flag' }], Math.PI / 4)
    const tangent = [swung[0]!.direction[0], 0, swung[0]!.direction[2]] as Vec3
    const length = Math.hypot(...tangent)
    // 第一枚在正前方偏 45°（左右由切平面的手性决定，这里只看角度）。
    expect(Math.abs(dot(tangent, right)) / length).toBeCloseTo(Math.sin(Math.PI / 4), 6)
    expect(dot(tangent, facing) / length).toBeCloseTo(Math.cos(Math.PI / 4), 6)
  })

  it('survives a degenerate facing and an empty list', () => {
    expect(layoutSurfaceMarks([0, 1, 0], [0, 1, 0], [])).toEqual([])
    const placed = layoutSurfaceMarks([0, 1, 0], [0, 0, 0], [{ answerId: 'a', kind: 'flag' }])
    expect(placed).toHaveLength(1)
    expect(unit(placed[0]!.direction)).toBeCloseTo(1, 9)
  })
})
