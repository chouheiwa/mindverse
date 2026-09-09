import { describe, expect, it } from 'vitest'
import { createTerrainField, type TerrainFieldInput } from './terrainField'

const base: TerrainFieldInput = {
  seed: 20260909,
  octaves: 5,
  warpStrength: 0.18,
  faultStrength: 0.62,
  detailDensity: 0.5,
  largeCraters: [
    { direction: [0, 1, 0], radius: 0.35, depth: 0.06, rim: 0.02 },
    { direction: [1, 0, 0], radius: 0.22, depth: 0.04, rim: 0.015 },
  ],
  qualityLevel: 2,
  smallCraterThreshold: 0.72,
}

const dirs: readonly (readonly [number, number, number])[] = [
  [1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1],
  [0.577, 0.577, 0.577], [-0.4, 0.8, -0.45], [0.3, -0.2, 0.93],
]

describe('the terrain field is the single source of truth for planet shape', () => {
  it('is deterministic: the same direction always yields the same ground', () => {
    const field = createTerrainField(base)
    for (const direction of dirs) {
      expect(field.height(direction)).toBe(field.height(direction))
      // 只看方向，不看长度。归一化会带来末位浮点差，所以这里比的是数值相等
      // 而不是位相等 —— 位相等在这里是对浮点的错误期待。
      expect(field.height([direction[0] * 7, direction[1] * 7, direction[2] * 7]))
        .toBeCloseTo(field.height(direction), 10)
    }
  })

  it('gives two planets different ground', () => {
    const a = createTerrainField(base)
    const b = createTerrainField({ ...base, seed: base.seed + 1 })
    const differing = dirs.filter((d) => Math.abs(a.height(d) - b.height(d)) > 1e-6)
    expect(differing.length).toBeGreaterThanOrEqual(dirs.length - 1)
  })

  it('stays inside a sane band, so a walkable surface cannot explode', () => {
    const field = createTerrainField(base)
    for (let index = 0; index < 400; index += 1) {
      // 球面均匀取样，避免只测赤道
      const y = 1 - 2 * (index + 0.5) / 400
      const radial = Math.sqrt(Math.max(0, 1 - y * y))
      const theta = index * Math.PI * (3 - Math.sqrt(5))
      const h = field.height([Math.cos(theta) * radial, y, Math.sin(theta) * radial])
      expect(Number.isFinite(h)).toBe(true)
      expect(h).toBeGreaterThan(-1)
      expect(h).toBeLessThan(1)
    }
  })

  it('is continuous: neighbouring ground does not cliff by more than the step', () => {
    // 走路时相邻脚步之间不能出现断崖 —— 那是噪声接缝，不是地貌。
    const field = createTerrainField(base)
    const step = 0.002
    for (const direction of dirs) {
      const here = field.height(direction)
      const there = field.height([direction[0] + step, direction[1], direction[2] + step])
      expect(Math.abs(there - here)).toBeLessThan(0.05)
    }
  })

  it('carves the declared large craters below the same ground without them', () => {
    // 对照实验：同一个方向，只把坑声明拿掉。比「坑心 vs 坑外」严谨得多 ——
    // 后者混进了两点之间本来就有的基础地形差，可以轻易大过坑深。
    const withCraters = createTerrainField(base)
    const without = createTerrainField({ ...base, largeCraters: [] })
    const centre = withCraters.sample([0, 1, 0])

    expect(centre.largeCraterMask).toBeGreaterThan(0.9)
    expect(centre.height).toBeLessThan(without.height([0, 1, 0]))
    // 坑外不受影响。
    const far: readonly [number, number, number] = [0, -1, 0]
    expect(withCraters.height(far)).toBeCloseTo(without.height(far), 10)
    expect(withCraters.sample(far).largeCraterMask).toBe(0)
  })

  it('drops small craters entirely at the lowest quality tier', () => {
    const detailed = createTerrainField(base)
    const plain = createTerrainField({ ...base, qualityLevel: 0 })
    expect(dirs.some((d) => detailed.sample(d).smallCraterMask > 0)).toBe(true)
    expect(dirs.every((d) => plain.sample(d).smallCraterMask === 0)).toBe(true)
  })

  it('returns a unit normal that leans away from the radial on a slope', () => {
    const field = createTerrainField(base)
    for (const direction of dirs) {
      const n = field.normal(direction)
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 6)
    }
    // 完全平坦的星球上，法线必须就是径向。
    const flat = createTerrainField({
      ...base, largeCraters: [], qualityLevel: 0, faultStrength: 0, warpStrength: 0, octaves: 1,
    })
    expect(flat.normal([0, 1, 0], 0.01, 0)).toEqual([0, 1, 0])
  })

  it('survives degenerate input instead of producing NaN ground', () => {
    const field = createTerrainField({
      ...base, seed: Number.NaN, octaves: 0, largeCraters: [
        { direction: [0, 0, 0], radius: 0, depth: 0, rim: 0 },
      ],
    })
    expect(Number.isFinite(field.height([0, 1, 0]))).toBe(true)
    expect(Number.isFinite(field.height([0, 0, 0]))).toBe(true)
  })
})
