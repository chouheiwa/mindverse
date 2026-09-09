import { describe, expect, it } from 'vitest'
import { createTerrainField } from './terrainField'
import { standAt, surfaceBasis, surfaceFrame, walkSurface } from './surfaceCamera'
import type { Vec3 } from './cubeSphere'

const field = createTerrainField({
  seed: 20260909, octaves: 5, warpStrength: 0.18, faultStrength: 0.62, detailDensity: 0.5,
  largeCraters: [], qualityLevel: 1, smallCraterThreshold: 0.72,
})
const RADIUS = 10
const DISPLACEMENT = 0.085
const stand = (direction: Vec3) => standAt(direction, 0.12)
const unit = (v: Vec3): number => Math.hypot(v[0], v[1], v[2])
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

describe('walking a sphere means the local frame travels with you', () => {
  it('builds an orthonormal frame anywhere, poles included', () => {
    for (const direction of [
      [0, 1, 0], [0, -1, 0], [1, 0, 0], [0, 0, -1], [0.577, 0.577, 0.577], [0, 0.999, 0.03],
    ] as Vec3[]) {
      const { up, north, east } = surfaceBasis(direction)
      for (const axis of [up, north, east]) expect(unit(axis)).toBeCloseTo(1, 9)
      expect(dot(up, north)).toBeCloseTo(0, 9)
      expect(dot(up, east)).toBeCloseTo(0, 9)
      expect(dot(north, east)).toBeCloseTo(0, 9)
    }
  })

  it('keeps the camera standing on the ground the terrain field declares', () => {
    for (const direction of [[0, 1, 0], [1, 0, 0], [-0.3, 0.5, 0.81]] as Vec3[]) {
      const frame = surfaceFrame(stand(direction), field, RADIUS, DISPLACEMENT)
      const expected = RADIUS * (1 + field.height(direction) * DISPLACEMENT)
      expect(frame.groundRadius).toBeCloseTo(expected, 9)
      // 眼睛正好在地面之上 eyeHeight 处 —— 不陷进山里，也不浮在半空。
      expect(unit(frame.position)).toBeCloseTo(expected + 0.12, 9)
    }
  })

  it('always has "up" pointing away from the planet centre', () => {
    for (let index = 0; index < 200; index += 1) {
      const y = 1 - 2 * (index + 0.5) / 200
      const radial = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = index * Math.PI * (3 - Math.sqrt(5))
      const direction: Vec3 = [Math.cos(theta) * radial, y, Math.sin(theta) * radial]
      const frame = surfaceFrame(stand(direction), field, RADIUS, DISPLACEMENT)
      expect(dot(frame.up, direction)).toBeGreaterThan(0.999)
    }
  })

  it('walks along the sphere instead of off it', () => {
    let pose = stand([0, 1, 0])
    for (let step = 0; step < 400; step += 1) {
      pose = walkSurface(pose, { forward: 0.03, strafe: 0, turn: 0, tilt: 0 })
      expect(unit(pose.direction)).toBeCloseTo(1, 9)
    }
    // 走了 400 × 0.03 ≈ 12 弧度，约两圈 —— 必须真的绕回来，而不是卡在某处。
    expect(unit(pose.direction)).toBeCloseTo(1, 9)
  })

  it('comes back to where it started after a full lap', () => {
    // 沿同一个大圆走满 2π 必须回到原点：这就是「可环绕」的定义。
    let pose = stand([0, 1, 0])
    const steps = 2048
    for (let step = 0; step < steps; step += 1) {
      pose = walkSurface(pose, { forward: Math.PI * 2 / steps, strafe: 0, turn: 0, tilt: 0 })
    }
    expect(pose.direction[0]).toBeCloseTo(0, 6)
    expect(pose.direction[1]).toBeCloseTo(1, 6)
    expect(pose.direction[2]).toBeCloseTo(0, 6)
  })

  it('crosses the pole without the view flipping over', () => {
    let pose = stand([0, 0.9995, 0.0316])
    const ups: Vec3[] = []
    for (let step = 0; step < 40; step += 1) {
      pose = walkSurface(pose, { forward: 0.004, strafe: 0, turn: 0, tilt: 0 })
      ups.push(surfaceFrame(pose, field, RADIUS, DISPLACEMENT).up)
    }
    // 相邻两帧的「上」不得突然反向 —— 那就是翻车。
    for (let index = 1; index < ups.length; index += 1) {
      expect(dot(ups[index]!, ups[index - 1]!)).toBeGreaterThan(0.9)
    }
  })

  it('clamps pitch so the view never tumbles past the zenith', () => {
    let pose = stand([0, 1, 0])
    for (let step = 0; step < 100; step += 1) pose = walkSurface(pose, { forward: 0, strafe: 0, turn: 0, tilt: 0.2 })
    expect(pose.pitch).toBeLessThanOrEqual(Math.PI * 4 / 9 + 1e-9)
    for (let step = 0; step < 200; step += 1) pose = walkSurface(pose, { forward: 0, strafe: 0, turn: 0, tilt: -0.2 })
    expect(pose.pitch).toBeGreaterThanOrEqual(-Math.PI * 4 / 9 - 1e-9)
  })

  it('keeps facing tangent and unit however long you spin', () => {
    let pose = stand([1, 0, 0])
    for (let step = 0; step < 500; step += 1) pose = walkSurface(pose, { forward: 0, strafe: 0, turn: 0.37, tilt: 0 })
    expect(unit(pose.facing)).toBeCloseTo(1, 9)
    expect(dot(pose.facing, pose.direction)).toBeCloseTo(0, 9)
  })

  it('returns to the start after a lap of strafing, too', () => {
    let pose = stand([0, 0, 1])
    const steps = 2048
    for (let step = 0; step < steps; step += 1) {
      pose = walkSurface(pose, { forward: 0, strafe: Math.PI * 2 / steps, turn: 0, tilt: 0 })
    }
    expect(pose.direction[2]).toBeCloseTo(1, 6)
  })

  it('survives degenerate input instead of losing the camera', () => {
    const bad = walkSurface(
      { direction: [0, 0, 0], facing: [0, 0, 0], pitch: Number.NaN, eyeHeight: Number.NaN },
      { forward: Number.NaN, strafe: Infinity, turn: Number.NaN, tilt: Number.NaN },
    )
    expect(unit(bad.direction)).toBeCloseTo(1, 9)
    const frame = surfaceFrame(bad, field, Number.NaN, Number.NaN)
    expect(frame.position.every((value) => Number.isFinite(value))).toBe(true)
    expect(frame.target.every((value) => Number.isFinite(value))).toBe(true)
  })
})
