import { faceDirection, type CubeFace } from './cubeSphere'
import type { PlanetTerrainField } from './terrainField'
import type { TerrainChunk } from './terrainChunks'

// 把一个块变成真实网格。
//
// 顶点位置由 CPU 的地形场算出来 —— 着色器不再负责形状（理由见 terrainField
// 的文件头：GPU 与 CPU 的 sin 精度差让两边对不上，只能一边说了算）。
//
// 裙边（skirt）是这里唯一不显然的东西：相邻块层级不同时，粗块边上少一半顶点，
// 细块那条边会在中间「鼓」出来，两边之间露出一条缝，能看见星空。沿边缘往球心
// 方向垂一圈裙边就能把缝挡住 —— 比在 CPU 上做层级缝合便宜得多，也不会因为
// 层级每帧变化而反复重建拓扑。

export interface TerrainMeshData {
  readonly positions: Float32Array
  readonly normals: Float32Array
  readonly indices: Uint32Array
  /** 不含裙边的顶点数，便于用例区分地面与裙边。 */
  readonly surfaceVertexCount: number
}

export interface TerrainMeshInput {
  readonly chunk: TerrainChunk
  readonly field: PlanetTerrainField
  /** 行星基准半径（世界单位）。 */
  readonly radius: number
  /** 高度场到世界单位的比例，与着色器的 uDisplacement 同义。 */
  readonly displacement: number
  /** 每边的格数。顶点数是 (resolution + 1)²。 */
  readonly resolution: number
  /** 裙边下垂深度，按半径比例。0 表示不生成裙边。 */
  readonly skirtDepth: number
}

const clampResolution = (value: number): number =>
  Math.max(1, Math.min(64, Number.isFinite(value) ? Math.round(value) : 8))

export function buildTerrainMesh(input: TerrainMeshInput): TerrainMeshData {
  const resolution = clampResolution(input.resolution)
  const side = resolution + 1
  const radius = Number.isFinite(input.radius) && input.radius > 0 ? input.radius : 1
  const displacement = Number.isFinite(input.displacement) ? input.displacement : 0
  const skirtDepth = Number.isFinite(input.skirtDepth) && input.skirtDepth > 0 ? input.skirtDepth : 0
  const { chunk, field } = input

  const surfaceVertexCount = side * side
  const skirtVertexCount = skirtDepth > 0 ? 4 * resolution : 0
  const positions = new Float32Array((surfaceVertexCount + skirtVertexCount) * 3)
  const normals = new Float32Array((surfaceVertexCount + skirtVertexCount) * 3)

  const directions: [number, number, number][] = new Array(surfaceVertexCount)
  const heights = new Float64Array(surfaceVertexCount)

  for (let row = 0; row < side; row += 1) {
    for (let column = 0; column < side; column += 1) {
      const index = row * side + column
      const u = chunk.u + (column / resolution * 2 - 1) * chunk.halfSize
      const v = chunk.v + (row / resolution * 2 - 1) * chunk.halfSize
      const direction = faceDirection(chunk.face, u, v)
      const height = field.height(direction)
      directions[index] = [direction[0], direction[1], direction[2]]
      heights[index] = height
      const scale = radius * (1 + height * displacement)
      positions[index * 3] = direction[0] * scale
      positions[index * 3 + 1] = direction[1] * scale
      positions[index * 3 + 2] = direction[2] * scale
      const normal = field.normal(direction, Math.max(1e-4, chunk.halfSize / resolution), displacement)
      normals[index * 3] = normal[0]
      normals[index * 3 + 1] = normal[1]
      normals[index * 3 + 2] = normal[2]
    }
  }

  const triangles: number[] = []
  // Babylon 左手系：三角形 (p1,p2,p3) 的正面法线是 (p1−p2)×(p3−p2)。立方体六个面的
  // (u,v) 手性不一致，固定顶点顺序会让一半的面从星球外看被背面剔除 —— 脚下的地面
  // 直接消失。所以按几何决定绕向：正面必须朝着顶点法线（向外）。
  const pushOutward = (i1: number, i2: number, i3: number): void => {
    const ax = positions[i1 * 3]! - positions[i2 * 3]!
    const ay = positions[i1 * 3 + 1]! - positions[i2 * 3 + 1]!
    const az = positions[i1 * 3 + 2]! - positions[i2 * 3 + 2]!
    const bx = positions[i3 * 3]! - positions[i2 * 3]!
    const by = positions[i3 * 3 + 1]! - positions[i2 * 3 + 1]!
    const bz = positions[i3 * 3 + 2]! - positions[i2 * 3 + 2]!
    const fx = ay * bz - az * by
    const fy = az * bx - ax * bz
    const fz = ax * by - ay * bx
    const rx = normals[i1 * 3]! + normals[i2 * 3]! + normals[i3 * 3]!
    const ry = normals[i1 * 3 + 1]! + normals[i2 * 3 + 1]! + normals[i3 * 3 + 1]!
    const rz = normals[i1 * 3 + 2]! + normals[i2 * 3 + 2]! + normals[i3 * 3 + 2]!
    if (fx * rx + fy * ry + fz * rz >= 0) triangles.push(i1, i2, i3)
    else triangles.push(i1, i3, i2)
  }
  for (let row = 0; row < resolution; row += 1) {
    for (let column = 0; column < resolution; column += 1) {
      const a = row * side + column
      const b = a + 1
      const c = a + side
      const d = c + 1
      pushOutward(a, c, b)
      pushOutward(b, c, d)
    }
  }

  if (skirtDepth > 0) {
    const drop = radius * skirtDepth
    let skirtIndex = surfaceVertexCount
    const edge = (edgeIndex: number, previousEdgeIndex: number): void => {
      const direction = directions[edgeIndex]!
      const scale = radius * (1 + heights[edgeIndex]! * displacement) - drop
      positions[skirtIndex * 3] = direction[0] * scale
      positions[skirtIndex * 3 + 1] = direction[1] * scale
      positions[skirtIndex * 3 + 2] = direction[2] * scale
      normals[skirtIndex * 3] = normals[edgeIndex * 3]!
      normals[skirtIndex * 3 + 1] = normals[edgeIndex * 3 + 1]!
      normals[skirtIndex * 3 + 2] = normals[edgeIndex * 3 + 2]!
      if (previousEdgeIndex >= 0) {
        pushOutward(previousEdgeIndex, skirtIndex - 1, edgeIndex)
        pushOutward(edgeIndex, skirtIndex - 1, skirtIndex)
      }
      skirtIndex += 1
    }
    const walk = (indexAt: (step: number) => number): void => {
      let previous = -1
      for (let step = 0; step <= resolution; step += 1) {
        const current = indexAt(step)
        if (step === resolution) break
        edge(current, previous)
        previous = current
      }
    }
    walk((step) => step)
    walk((step) => step * side + resolution)
    walk((step) => resolution * side + (resolution - step))
    walk((step) => (resolution - step) * side)
  }

  return Object.freeze({
    positions,
    normals,
    indices: Uint32Array.from(triangles),
    surfaceVertexCount,
  })
}

/** 块中心的地面世界坐标，用于把相机与地面上的东西放对位置。 */
export function chunkGroundPoint(
  face: CubeFace, u: number, v: number,
  field: PlanetTerrainField, radius: number, displacement: number,
): readonly [number, number, number] {
  const direction = faceDirection(face, u, v)
  const scale = radius * (1 + field.height(direction) * displacement)
  return [direction[0] * scale, direction[1] * scale, direction[2] * scale]
}
