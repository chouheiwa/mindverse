import { describe, expect, it } from 'vitest'
import { faceDirection } from './cubeSphere'
import { createTerrainField, type TerrainFieldInput } from './terrainField'
import { buildTerrainMesh, chunkGroundPoint } from './terrainMesh'
import type { TerrainChunk } from './terrainChunks'

const fieldInput: TerrainFieldInput = {
  seed: 20260909, octaves: 5, warpStrength: 0.18, faultStrength: 0.62, detailDensity: 0.5,
  largeCraters: [{ direction: [0, 1, 0], radius: 0.35, depth: 0.06, rim: 0.02 }],
  qualityLevel: 1, smallCraterThreshold: 0.72,
}
const field = createTerrainField(fieldInput)
const chunk: TerrainChunk = { face: 2, u: 0.25, v: -0.5, halfSize: 0.25, depth: 2 }
const base = { chunk, field, radius: 10, displacement: 0.085, resolution: 8, skirtDepth: 0 }

describe('a chunk becomes real geometry, and the seams must not open', () => {
  it('lays out (n+1)² surface vertices and 2n² triangles', () => {
    const mesh = buildTerrainMesh(base)
    expect(mesh.surfaceVertexCount).toBe(81)
    expect(mesh.positions.length).toBe(81 * 3)
    expect(mesh.indices.length).toBe(8 * 8 * 2 * 3)
  })

  it('places every vertex at the height the terrain field declares', () => {
    const mesh = buildTerrainMesh(base)
    for (let row = 0; row <= 8; row += 1) {
      for (let column = 0; column <= 8; column += 1) {
        const index = row * 9 + column
        const u = chunk.u + (column / 8 * 2 - 1) * chunk.halfSize
        const v = chunk.v + (row / 8 * 2 - 1) * chunk.halfSize
        const direction = faceDirection(chunk.face, u, v)
        const expected = base.radius * (1 + field.height(direction) * base.displacement)
        const actual = Math.hypot(
          mesh.positions[index * 3]!, mesh.positions[index * 3 + 1]!, mesh.positions[index * 3 + 2]!,
        )
        expect(actual).toBeCloseTo(expected, 6)
      }
    }
  })

  it('shares an identical edge with the neighbouring chunk at the same level', () => {
    // 同级相邻块的公共边必须逐顶点重合，否则地面上会出现一条能看见星空的缝。
    const right: TerrainChunk = { ...chunk, u: chunk.u + chunk.halfSize * 2 }
    const left = buildTerrainMesh(base)
    const other = buildTerrainMesh({ ...base, chunk: right })
    for (let row = 0; row <= 8; row += 1) {
      const leftIndex = row * 9 + 8
      const rightIndex = row * 9
      for (let axis = 0; axis < 3; axis += 1) {
        expect(left.positions[leftIndex * 3 + axis]!)
          .toBeCloseTo(other.positions[rightIndex * 3 + axis]!, 9)
      }
    }
  })

  it('hangs a skirt below the rim so a level difference cannot show through', () => {
    const withSkirt = buildTerrainMesh({ ...base, skirtDepth: 0.02 })
    expect(withSkirt.positions.length / 3).toBe(81 + 4 * 8)
    // 裙边顶点必须严格低于它对应的地面顶点。
    const groundRadius = Math.hypot(
      withSkirt.positions[0]!, withSkirt.positions[1]!, withSkirt.positions[2]!,
    )
    const skirtRadius = Math.hypot(
      withSkirt.positions[81 * 3]!, withSkirt.positions[81 * 3 + 1]!, withSkirt.positions[81 * 3 + 2]!,
    )
    expect(skirtRadius).toBeLessThan(groundRadius)
    expect(groundRadius - skirtRadius).toBeCloseTo(base.radius * 0.02, 6)
    expect(withSkirt.indices.length).toBeGreaterThan(buildTerrainMesh(base).indices.length)
  })

  it('emits unit normals everywhere', () => {
    const mesh = buildTerrainMesh({ ...base, skirtDepth: 0.02 })
    for (let index = 0; index < mesh.positions.length / 3; index += 1) {
      const length = Math.hypot(
        mesh.normals[index * 3]!, mesh.normals[index * 3 + 1]!, mesh.normals[index * 3 + 2]!,
      )
      expect(length).toBeCloseTo(1, 6)
    }
  })

  it('keeps every index inside the vertex array', () => {
    const mesh = buildTerrainMesh({ ...base, skirtDepth: 0.02 })
    const vertexCount = mesh.positions.length / 3
    for (const index of mesh.indices) expect(index).toBeLessThan(vertexCount)
    expect(mesh.indices.length % 3).toBe(0)
  })

  it('never produces NaN geometry from degenerate input', () => {
    const mesh = buildTerrainMesh({
      ...base, radius: Number.NaN, displacement: Number.NaN, resolution: 0, skirtDepth: -1,
    })
    expect(mesh.positions.every((value) => Number.isFinite(value))).toBe(true)
    expect(mesh.normals.every((value) => Number.isFinite(value))).toBe(true)
  })

  it('puts a ground point exactly on the surface it reports', () => {
    const point = chunkGroundPoint(2, 0.25, -0.5, field, 10, 0.085)
    const direction = faceDirection(2, 0.25, -0.5)
    expect(Math.hypot(...point)).toBeCloseTo(10 * (1 + field.height(direction) * 0.085), 9)
  })

  it('winds every triangle so its Babylon front face points outward on all six cube faces', () => {
    // Babylon 左手系：三角形 (p1,p2,p3) 的正面法线是 (p1−p2)×(p3−p2)。固定的顶点顺序在
    // 六个立方体面上手性不一致 —— 绕反的面从星球外看被背面剔除，脚下的地面直接消失，
    // 只剩裙边发亮（实测地表画布点亮比例 0.028）。
    for (const face of [0, 1, 2, 3, 4, 5] as const) {
      for (const [u, v] of [[0.25, -0.5], [-0.6, 0.3], [0, 0]] as const) {
        const mesh = buildTerrainMesh({ ...base, chunk: { face, u, v, halfSize: 0.25, depth: 2 }, skirtDepth: 0.02 })
        const p = mesh.positions
        const n = mesh.normals
        for (let index = 0; index < mesh.indices.length; index += 3) {
          const [i1, i2, i3] = [mesh.indices[index]!, mesh.indices[index + 1]!, mesh.indices[index + 2]!]
          const ax = p[i1 * 3]! - p[i2 * 3]!, ay = p[i1 * 3 + 1]! - p[i2 * 3 + 1]!, az = p[i1 * 3 + 2]! - p[i2 * 3 + 2]!
          const bx = p[i3 * 3]! - p[i2 * 3]!, by = p[i3 * 3 + 1]! - p[i2 * 3 + 1]!, bz = p[i3 * 3 + 2]! - p[i2 * 3 + 2]!
          const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx
          const rx = n[i1 * 3]! + n[i2 * 3]! + n[i3 * 3]!
          const ry = n[i1 * 3 + 1]! + n[i2 * 3 + 1]! + n[i3 * 3 + 1]!
          const rz = n[i1 * 3 + 2]! + n[i2 * 3 + 2]! + n[i3 * 3 + 2]!
          expect(fx * rx + fy * ry + fz * rz, `face ${face} u ${u} v ${v} triangle ${index / 3}`).toBeGreaterThan(0)
        }
      }
    }
  })
})
