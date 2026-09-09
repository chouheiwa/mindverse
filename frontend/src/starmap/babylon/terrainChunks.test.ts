import { describe, expect, it } from 'vitest'
import { directionFace, faceDirection, type Vec3 } from './cubeSphere'
import { coveredArea, selectTerrainChunks, type TerrainChunk } from './terrainChunks'

const orbit = { cameraDirection: [0, 1, 0] as Vec3, cameraRadius: 4, maxDepth: 5, detailAngle: 0.35, budget: 400 }
const ground = { ...orbit, cameraRadius: 1.02 }

/** 块内是否包含某个面内点。边界算在内，用于重叠检测时单独处理。 */
const contains = (chunk: TerrainChunk, face: number, u: number, v: number): boolean =>
  chunk.face === face
  && u > chunk.u - chunk.halfSize && u < chunk.u + chunk.halfSize
  && v > chunk.v - chunk.halfSize && v < chunk.v + chunk.halfSize

describe('chunk selection must never leave a hole in the ground', () => {
  it('always covers the whole sphere exactly once, at every camera height', () => {
    for (const input of [orbit, ground, { ...orbit, cameraRadius: 1.0005 }]) {
      const chunks = selectTerrainChunks(input)
      // 面内面积守恒：六个面各 2×2，合计 24。少了是洞，多了是重叠。
      expect(coveredArea(chunks)).toBeCloseTo(24, 9)
    }
  })

  it('puts exactly one chunk under any given point', () => {
    const chunks = selectTerrainChunks(ground)
    for (let index = 0; index < 600; index += 1) {
      const y = 1 - 2 * (index + 0.5) / 600
      const radial = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = index * Math.PI * (3 - Math.sqrt(5))
      const { face, u, v } = directionFace([Math.cos(theta) * radial, y, Math.sin(theta) * radial])
      const owners = chunks.filter((chunk) => contains(chunk, face, u, v))
      expect(owners.length).toBeLessThanOrEqual(1)
    }
  })

  it('spends its detail where the camera is, and leaves the far side coarse', () => {
    const chunks = selectTerrainChunks(ground)
    const near = chunks.filter((chunk) => faceDirection(chunk.face, chunk.u, chunk.v)[1] > 0.7)
    const far = chunks.filter((chunk) => faceDirection(chunk.face, chunk.u, chunk.v)[1] < -0.7)
    expect(near.length).toBeGreaterThan(0)
    expect(far.length).toBeGreaterThan(0)
    const deepest = (list: readonly TerrainChunk[]) => Math.max(...list.map(({ depth }) => depth))
    expect(deepest(near)).toBeGreaterThan(deepest(far))
  })

  it('gets finer as the camera descends', () => {
    const high = selectTerrainChunks({ ...orbit, cameraRadius: 6 })
    const low = selectTerrainChunks(ground)
    expect(low.length).toBeGreaterThan(high.length)
  })

  it('respects the budget by staying coarse rather than dropping chunks', () => {
    const tight = selectTerrainChunks({ ...ground, budget: 40 })
    expect(tight.length).toBeLessThanOrEqual(40)
    // 预算再紧也不能出洞。
    expect(coveredArea(tight)).toBeCloseTo(24, 9)
  })

  it('never exceeds the declared depth', () => {
    for (const maxDepth of [0, 1, 3]) {
      const chunks = selectTerrainChunks({ ...ground, maxDepth })
      expect(Math.max(...chunks.map(({ depth }) => depth))).toBeLessThanOrEqual(maxDepth)
      expect(coveredArea(chunks)).toBeCloseTo(24, 9)
    }
    expect(selectTerrainChunks({ ...ground, maxDepth: 0 })).toHaveLength(6)
  })

  it('is deterministic, so the same pose rebuilds the same ground', () => {
    const a = selectTerrainChunks(ground)
    const b = selectTerrainChunks(ground)
    expect(a).toEqual(b)
  })

  it('survives degenerate input instead of returning nothing', () => {
    for (const bad of [
      { ...ground, cameraDirection: [0, 0, 0] as Vec3 },
      { ...ground, cameraRadius: Number.NaN },
      { ...ground, detailAngle: 0 },
      { ...ground, budget: -5 },
    ]) {
      const chunks = selectTerrainChunks(bad)
      expect(chunks.length).toBeGreaterThanOrEqual(6)
      expect(coveredArea(chunks)).toBeCloseTo(24, 9)
    }
  })
})
