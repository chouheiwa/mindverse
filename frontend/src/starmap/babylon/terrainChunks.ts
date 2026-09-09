import { CUBE_FACES, faceDirection, patchAngularSize, type CubeFace, type Vec3 } from './cubeSphere'

// 分块 LOD 选择。
//
// 整颗星按同一密度铺满是不可能的：脚下要看清石头，背面那半个球一个格子就够。
// 所以每个面从一整格开始，只要「这块在屏幕上还太大」就四分，直到够细或到达
// 深度上限。判据是**角直径**：块的球面尺度除以相机到它的距离 —— 这正是它在
// 视野里占多大，比单纯按距离分级更贴近观感。
//
// 选出来的是一棵四叉树的**叶子集合**：互不重叠、并起来正好是整个球面。
// 这两条性质有用例钉着，因为它们一旦破了就是地面上出现空洞或 z-fighting。

export interface TerrainChunk {
  readonly face: CubeFace
  /** 块中心的面内坐标，取值 [-1, 1]。 */
  readonly u: number
  readonly v: number
  /** 块的半边长（面内单位）。深度每加一层减半。 */
  readonly halfSize: number
  readonly depth: number
}

export interface ChunkSelectionInput {
  /** 相机所在方向（不必归一化）。 */
  readonly cameraDirection: Vec3
  /** 相机到球心的距离，单位是行星半径。贴地时接近 1。 */
  readonly cameraRadius: number
  /** 最大细分深度。0 表示每面一块。 */
  readonly maxDepth: number
  /** 角直径超过它就继续细分。越小越细。 */
  readonly detailAngle: number
  /** 叶子块数量上限，防止贴地时无限铺开。 */
  readonly budget: number
}

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2])
  return length > 0 && Number.isFinite(length) ? [v[0] / length, v[1] / length, v[2] / length] : [0, 1, 0]
}

/** 块中心到相机的距离，单位与 cameraRadius 一致。相机贴地时它趋近 0。 */
function chunkDistance(chunk: TerrainChunk, cameraDirection: Vec3, cameraRadius: number): number {
  const centre = faceDirection(chunk.face, chunk.u, chunk.v)
  const dx = centre[0] - cameraDirection[0] * cameraRadius
  const dy = centre[1] - cameraDirection[1] * cameraRadius
  const dz = centre[2] - cameraDirection[2] * cameraRadius
  return Math.hypot(dx, dy, dz)
}

/**
 * 选出覆盖整个球面的叶子块集合。
 *
 * 先按角直径决定该不该细分，再用预算兜底：预算耗尽时停止细分，而不是丢块 ——
 * 丢块会在地面上留洞，宁可粗也不能缺。
 */
export function selectTerrainChunks(input: ChunkSelectionInput): readonly TerrainChunk[] {
  const cameraDirection = normalize(input.cameraDirection)
  const cameraRadius = Number.isFinite(input.cameraRadius) && input.cameraRadius > 0
    ? input.cameraRadius
    : 1
  const maxDepth = Math.max(0, Math.min(8, Math.round(input.maxDepth)))
  const detailAngle = Number.isFinite(input.detailAngle) && input.detailAngle > 0
    ? input.detailAngle
    : 0.35
  const budget = Math.max(6, Math.round(input.budget))

  let level: TerrainChunk[] = CUBE_FACES.map((face) => ({ face, u: 0, v: 0, halfSize: 1, depth: 0 }))
  const leaves: TerrainChunk[] = []

  while (level.length > 0) {
    const next: TerrainChunk[] = []
    for (const chunk of level) {
      const angular = patchAngularSize(chunk.face, chunk.u, chunk.v, chunk.halfSize)
      const distance = Math.max(1e-4, chunkDistance(chunk, cameraDirection, cameraRadius))
      const apparent = angular / distance
      const wouldFit = leaves.length + next.length + level.length + 3 <= budget
      if (chunk.depth < maxDepth && apparent > detailAngle && wouldFit) {
        const half = chunk.halfSize / 2
        for (const [du, dv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          next.push({
            face: chunk.face,
            u: chunk.u + du * half,
            v: chunk.v + dv * half,
            halfSize: half,
            depth: chunk.depth + 1,
          })
        }
      } else {
        leaves.push(chunk)
      }
    }
    level = next
  }
  return Object.freeze(leaves)
}

/** 叶子集合覆盖的面内总面积。整球应当正好是 6 × 4 = 24。 */
export function coveredArea(chunks: readonly TerrainChunk[]): number {
  return chunks.reduce((sum, chunk) => sum + (chunk.halfSize * 2) ** 2, 0)
}
