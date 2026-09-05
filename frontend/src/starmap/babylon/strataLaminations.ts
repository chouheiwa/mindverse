import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { LAMINATION_HEIGHT, laminationAt } from './strataPalette'

/**
 * 把沉积纹层写进岩壁的顶点色。
 *
 * 用顶点色而不是纹理：不增加 draw call，也不会在掠射角上被各向异性过滤糊平。
 * 采样按顶点的**局部 Y**，所以同一条纹层在整圈岩壁上是连续的。
 */
export function paintLaminations(mesh: Mesh, height: number): boolean {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind)
  if (!positions || positions.length === 0) return false
  const span = Number.isFinite(height) && height > 0 ? height : LAMINATION_HEIGHT
  const colors = new Float32Array((positions.length / 3) * 4)
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    const y = positions[vertex * 3 + 1] as number
    // 局部坐标里圆柱以中心为原点：换成「自层顶向下」的比例。
    const level = laminationAt((span / 2 - y) / LAMINATION_HEIGHT)
    colors.set([level, level, level, 1], vertex * 4)
  }
  mesh.setVerticesData(VertexBuffer.ColorKind, colors, false, 4)
  mesh.hasVertexAlpha = false
  return true
}

/** 便于测试：把一段高度上的纹层灰度取样出来。 */
export function laminationSamples(height: number, count: number): number[] {
  const span = Number.isFinite(height) && height > 0 ? height : LAMINATION_HEIGHT
  const steps = Math.max(2, Math.floor(count))
  return Array.from({ length: steps }, (_unused, index) =>
    laminationAt((index / steps) * (span / LAMINATION_HEIGHT)))
}
