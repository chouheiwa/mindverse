import { describe, expect, it } from 'vitest'
import { CUBE_FACES, directionFace, faceDirection, patchAngularSize, type Vec3 } from './cubeSphere'

const unit = (v: Vec3): number => Math.hypot(v[0], v[1], v[2])

describe('the cube sphere is what makes "walk anywhere" possible', () => {
  it('always lands on the unit sphere', () => {
    for (const face of CUBE_FACES) {
      for (let u = -1; u <= 1; u += 0.25) {
        for (let v = -1; v <= 1; v += 0.25) {
          expect(unit(faceDirection(face, u, v))).toBeCloseTo(1, 12)
        }
      }
    }
  })

  it('round-trips direction → face/uv → direction', () => {
    for (const face of CUBE_FACES) {
      for (let u = -0.95; u <= 0.95; u += 0.19) {
        for (let v = -0.95; v <= 0.95; v += 0.19) {
          const direction = faceDirection(face, u, v)
          const found = directionFace(direction)
          expect(found.face).toBe(face)
          expect(found.u).toBeCloseTo(u, 10)
          expect(found.v).toBeCloseTo(v, 10)
        }
      }
    }
  })

  it('covers the whole sphere: every direction belongs to exactly one face', () => {
    const seen = new Set<number>()
    for (let index = 0; index < 4000; index += 1) {
      const y = 1 - 2 * (index + 0.5) / 4000
      const radial = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = index * Math.PI * (3 - Math.sqrt(5))
      const direction: Vec3 = [Math.cos(theta) * radial, y, Math.sin(theta) * radial]
      const { face, u, v } = directionFace(direction)
      seen.add(face)
      expect(Math.abs(u)).toBeLessThanOrEqual(1 + 1e-9)
      expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-9)
      const back = faceDirection(face, u, v)
      expect(back[0]).toBeCloseTo(direction[0], 9)
      expect(back[1]).toBeCloseTo(direction[1], 9)
      expect(back[2]).toBeCloseTo(direction[2], 9)
    }
    expect(seen.size).toBe(6)
  })

  it('meets seamlessly at the face edges, so walking across a seam is continuous', () => {
    // +Z 面的右边缘与 +X 面的左边缘必须是同一条线；差一点走过去就会掉进缝里。
    for (let v = -1; v <= 1; v += 0.1) {
      const rightEdge = faceDirection(4, 1, v)
      const neighbour = directionFace(rightEdge)
      const back = faceDirection(neighbour.face, neighbour.u, neighbour.v)
      expect(back[0]).toBeCloseTo(rightEdge[0], 10)
      expect(back[1]).toBeCloseTo(rightEdge[1], 10)
      expect(back[2]).toBeCloseTo(rightEdge[2], 10)
    }
  })

  it('tangent correction roughly halves the density spread, and the control proves it', () => {
    // 面心格与面角格的球面尺度之比。对照组是「直接把立方体顶点归一化」，
    // 也就是不做正切校正的做法 —— 断言的是校正确实有效，而不是一个拍脑袋的数。
    const plain = (u: number, v: number, half: number): number => {
      const point = (a: number, b: number): Vec3 => {
        const length = Math.hypot(1, b, a)
        return [1 / length, b / length, -a / length]
      }
      const a = point(u - half, v - half)
      const b = point(u + half, v + half)
      return Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
    }
    const half = 0.0625
    const plainSpread = plain(0, 0, half) / plain(0.9375, 0.9375, half)
    const warpedSpread = patchAngularSize(0, 0, 0, half) / patchAngularSize(0, 0.9375, 0.9375, half)

    expect(plainSpread).toBeGreaterThan(2.5)
    expect(warpedSpread).toBeLessThan(plainSpread * 0.6)
    expect(warpedSpread).toBeLessThan(1.6)
    expect(warpedSpread).toBeGreaterThan(1)
  })

  it('reports a larger angular size for a larger patch', () => {
    expect(patchAngularSize(2, 0, 0, 0.5)).toBeGreaterThan(patchAngularSize(2, 0, 0, 0.125))
  })

  it('survives a degenerate direction instead of returning NaN', () => {
    for (const bad of [[0, 0, 0], [Number.NaN, 1, 0], [Infinity, 0, 0]] as Vec3[]) {
      const found = directionFace(bad)
      expect(Number.isFinite(found.u)).toBe(true)
      expect(Number.isFinite(found.v)).toBe(true)
    }
    expect(unit(faceDirection(0, Number.NaN, Number.NaN))).toBeCloseTo(1, 12)
  })
})
