import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer.js'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder.js'
import { Mesh } from '@babylonjs/core/Meshes/mesh.js'
import { Scene } from '@babylonjs/core/scene.js'
import { describe, expect, it } from 'vitest'
import { laminationSubdivisions } from './strataPalette'
import { laminationSamples, paintLaminations } from './strataLaminations'

function wall(thickness: number) {
  const scene = new Scene(new NullEngine())
  const mesh = CreateCylinder('wall', {
    height: thickness, diameter: 9.6, tessellation: 22,
    subdivisions: laminationSubdivisions(thickness), cap: Mesh.NO_CAP,
  }, scene)
  return { scene, mesh }
}

describe('strata laminations', () => {
  it('writes a vertex colour for every vertex of the wall', () => {
    const { mesh } = wall(6)
    expect(paintLaminations(mesh, 6)).toBe(true)
    const colors = mesh.getVerticesData(VertexBuffer.ColorKind)
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!
    expect(colors).toHaveLength((positions.length / 3) * 4)
    expect(colors!.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true)
  })

  it('bands vary along the wall height but not around its circumference', () => {
    const { mesh } = wall(6)
    paintLaminations(mesh, 6)
    const colors = mesh.getVerticesData(VertexBuffer.ColorKind)!
    const positions = mesh.getVerticesData(VertexBuffer.PositionKind)!
    const byHeight = new Map<string, Set<number>>()
    for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
      const key = (positions[vertex * 3 + 1] as number).toFixed(4)
      const set = byHeight.get(key) ?? new Set<number>()
      set.add(Number((colors[vertex * 4] as number).toFixed(5)))
      byHeight.set(key, set)
    }
    // 同一高度上整圈同色：纹层是水平的，不是斑点。
    for (const set of byHeight.values()) expect(set.size).toBe(1)
    // 不同高度之间必须有明显落差，否则还是一块平色。
    const levels = [...byHeight.values()].map((set) => [...set][0]!)
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.35)
  })

  it('keeps a thick layer banded rather than stretching one gradient over it', () => {
    const samples = laminationSamples(18, 48)
    let crossings = 0
    const mid = (Math.max(...samples) + Math.min(...samples)) / 2
    for (let index = 1; index < samples.length; index += 1) {
      if ((samples[index - 1]! - mid) * (samples[index]! - mid) < 0) crossings += 1
    }
    expect(crossings).toBeGreaterThanOrEqual(8)
  })

  it('reports failure instead of throwing on a mesh with no geometry', () => {
    const scene = new Scene(new NullEngine())
    expect(paintLaminations(new Mesh('empty', scene), 4)).toBe(false)
  })
})
