// 行星地形场（CPU）。
//
// 这是地形的**唯一真值来源**。原来它只活在 planet.vertex.fx.ts 的顶点着色器
// 里，可环绕的星球做不成 —— 绕着走要知道「脚下这一点的海拔」，才能把相机放在
// 正确高度、把东西放到地面上，而这些都在 CPU 侧。
//
// 为什么不能「CPU 抄一份噪声去对齐 GPU」：着色器的哈希是
// `fract(sin(dot(...)) * 43758.5453123)`，float32 与 float64 下 sin 的精度差被
// 放大四万倍，两边结果毫无关系。所以做法反过来 —— CPU 生成顶点，着色器不再
// 负责形状，只负责着色。一个真值来源，天然一致。
//
// 公式逐条照搬着色器，保住已经调好的地貌观感；只是执行的地方换了。

export interface TerrainCrater {
  readonly direction: readonly [number, number, number]
  readonly radius: number
  readonly depth: number
  readonly rim: number
}

export interface TerrainFieldInput {
  readonly seed: number
  readonly octaves: number
  readonly warpStrength: number
  readonly faultStrength: number
  readonly detailDensity: number
  readonly largeCraters: readonly TerrainCrater[]
  /** 0 关闭小坑，1 一层，2 两层 —— 与着色器的 uQualityLevel 同义。 */
  readonly qualityLevel: 0 | 1 | 2
  readonly smallCraterThreshold: number
}

export interface TerrainSample {
  /** 相对海平面的高度，单位是行星半径的比例。 */
  readonly height: number
  readonly relief: number
  readonly largeCraterMask: number
  readonly smallCraterMask: number
}

type Vec3 = readonly [number, number, number]

const fract = (value: number): number => value - Math.floor(value)

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  if (!(edge1 > edge0)) return value < edge0 ? 0 : 1
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / length, v[1] / length, v[2] / length]
}

export function createTerrainField(input: TerrainFieldInput) {
  const seed = Number.isFinite(input.seed) ? input.seed : 0
  const octaves = Math.min(6, Math.max(1, Math.round(input.octaves)))

  const hashGradient = (cell: Vec3): Vec3 => normalize([
    fract(Math.sin(dot(cell, [127.1, 311.7, 74.7]) + seed * 0.000071) * 43758.5453123) * 2 - 1,
    fract(Math.sin(dot(cell, [269.5, 183.3, 246.1]) + seed * 0.000071) * 43758.5453123) * 2 - 1,
    fract(Math.sin(dot(cell, [113.5, 271.9, 124.6]) + seed * 0.000071) * 43758.5453123) * 2 - 1,
  ])

  const hashCellPoint = (cell: Vec3): Vec3 => [
    fract(Math.sin(dot(cell, [157.1, 319.7, 83.3]) + seed * 0.000113) * 43758.5453123),
    fract(Math.sin(dot(cell, [221.7, 137.9, 301.3]) + seed * 0.000113) * 43758.5453123),
    fract(Math.sin(dot(cell, [97.7, 251.3, 199.1]) + seed * 0.000113) * 43758.5453123),
  ]

  const hashCellAcceptance = (cell: Vec3): number =>
    fract(Math.sin(dot(cell, [41.7, 289.1, 173.3]) + seed * 0.000193) * 24634.6345)

  const gradientNoise = (point: Vec3): number => {
    const cx = Math.floor(point[0]), cy = Math.floor(point[1]), cz = Math.floor(point[2])
    const lx = point[0] - cx, ly = point[1] - cy, lz = point[2] - cz
    const fx = lx * lx * (3 - 2 * lx), fy = ly * ly * (3 - 2 * ly), fz = lz * lz * (3 - 2 * lz)
    const corner = (ox: number, oy: number, oz: number): number =>
      dot(hashGradient([cx + ox, cy + oy, cz + oz]), [lx - ox, ly - oy, lz - oz])
    const nx00 = mix(corner(0, 0, 0), corner(1, 0, 0), fx)
    const nx10 = mix(corner(0, 1, 0), corner(1, 1, 0), fx)
    const nx01 = mix(corner(0, 0, 1), corner(1, 0, 1), fx)
    const nx11 = mix(corner(0, 1, 1), corner(1, 1, 1), fx)
    return mix(mix(nx00, nx10, fy), mix(nx01, nx11, fy), fz) * 0.9 + 0.5
  }

  const fbm = (point: Vec3, octaveCount: number): number => {
    let sum = 0
    let amplitude = 0.53
    let normalization = 0
    let current: Vec3 = point
    for (let octave = 0; octave < Math.min(6, octaveCount); octave += 1) {
      sum += gradientNoise(current) * amplitude
      normalization += amplitude
      current = [current[0] * 2.03 + 17.13, current[1] * 2.03 + 9.71, current[2] * 2.03 + 13.57]
      amplitude *= 0.5
    }
    return sum / Math.max(normalization, 0.0001)
  }

  const domainWarp = (point: Vec3): Vec3 => [
    fbm([point[0] + 11.7, point[1] + 3.1, point[2] + 7.9], 3) * 2 - 1,
    fbm([point[0] + 5.3, point[1] + 19.1, point[2] + 2.7], 3) * 2 - 1,
    fbm([point[0] + 13.1, point[1] + 8.3, point[2] + 23.7], 3) * 2 - 1,
  ]

  const ridgedNoise = (point: Vec3, octaveCount: number): number => {
    let sum = 0
    let amplitude = 0.56
    let normalization = 0
    let current: Vec3 = point
    for (let octave = 0; octave < Math.min(6, octaveCount); octave += 1) {
      const ridge = 1 - Math.abs(gradientNoise(current) * 2 - 1)
      sum += ridge * ridge * amplitude
      normalization += amplitude
      current = [current[0] * 2.11 + 7.1, current[1] * 2.11 + 13.7, current[2] * 2.11 + 5.9]
      amplitude *= 0.48
    }
    return sum / Math.max(normalization, 0.0001)
  }

  const craterProfile = (distance: number, radius: number, depth: number, rim: number): number => {
    const normalized = distance / Math.max(radius, 0.0001)
    const bowl = 1 - smoothstep(0, 0.72, normalized)
    const wall = smoothstep(0.42, 0.82, normalized) * (1 - smoothstep(0.82, 1, normalized))
    const rimBand = 1 - smoothstep(0, 0.18, Math.abs(normalized - 1))
    return -depth * bowl * bowl + depth * 0.18 * wall + rim * rimBand
  }

  const distanceBetween = (a: Vec3, b: Vec3): number =>
    Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

  const largeCraterField = (direction: Vec3): readonly [number, number] => {
    let height = 0
    let mask = 0
    for (const crater of input.largeCraters.slice(0, 8)) {
      if (!(crater.radius > 0)) continue
      const distance = distanceBetween(direction, normalize(crater.direction as Vec3))
      height += craterProfile(distance, crater.radius, crater.depth, crater.rim)
      mask = Math.max(mask, 1 - smoothstep(crater.radius * 0.35, crater.radius * 1.18, distance))
    }
    return [height, mask]
  }

  const smallCraterFieldScale = (direction: Vec3, frequency: number): readonly [number, number] => {
    const sample: Vec3 = [direction[0] * frequency, direction[1] * frequency, direction[2] * frequency]
    const center: Vec3 = [Math.floor(sample[0]), Math.floor(sample[1]), Math.floor(sample[2])]
    let height = 0
    let mask = 0
    for (let x = -1; x <= 1; x += 1) {
      for (let y = -1; y <= 1; y += 1) {
        for (let z = -1; z <= 1; z += 1) {
          const cell: Vec3 = [center[0] + x, center[1] + y, center[2] + z]
          const accepted = hashCellAcceptance(cell) >= input.smallCraterThreshold ? 1 : 0
          if (accepted === 0) continue
          const offset = hashCellPoint(cell)
          const candidate = normalize([cell[0] + offset[0], cell[1] + offset[1], cell[2] + offset[2]])
          const radius = mix(0.34, 0.58, hashCellPoint([cell[0] + 5.17, cell[1] + 5.17, cell[2] + 5.17])[0]) / frequency
          const distance = distanceBetween(direction, candidate)
          mask = Math.max(mask, 1 - smoothstep(radius * 0.35, radius * 1.2, distance))
          height += craterProfile(distance, radius, radius * 0.12, radius * 0.045)
        }
      }
    }
    return [height, mask]
  }

  const smallCraterField = (direction: Vec3): readonly [number, number] => {
    if (input.qualityLevel <= 0) return [0, 0]
    const first = smallCraterFieldScale(direction, mix(18, 28, input.detailDensity))
    if (input.qualityLevel < 2) return first
    const second = smallCraterFieldScale(direction, mix(37, 53, input.detailDensity))
    return [first[0] + second[0], Math.max(first[1], second[1])]
  }

  const sample = (rawDirection: Vec3): TerrainSample => {
    const direction = normalize(rawDirection)
    const warp = domainWarp([direction[0] * 1.7, direction[1] * 1.7, direction[2] * 1.7])
    const warped: Vec3 = [
      direction[0] + warp[0] * input.warpStrength,
      direction[1] + warp[1] * input.warpStrength,
      direction[2] + warp[2] * input.warpStrength,
    ]
    const continents = fbm([warped[0] * 2.1, warped[1] * 2.1, warped[2] * 2.1], octaves)
    const mountainMask = smoothstep(0.48, 0.72, continents)
    const ridges = ridgedNoise([warped[0] * 5.4, warped[1] * 5.4, warped[2] * 5.4], octaves)
      * mountainMask * input.faultStrength
    const detailScale = mix(11, 23, input.detailDensity)
    const fineDetail = (gradientNoise([
      warped[0] * detailScale, warped[1] * detailScale, warped[2] * detailScale,
    ]) - 0.5) * mix(0.028, 0.085, input.detailDensity)
    const large = largeCraterField(direction)
    const small = smallCraterField(direction)
    return Object.freeze({
      height: (continents - 0.48) * 0.72 + ridges * 0.28 + fineDetail + large[0] + small[0],
      relief: ridges * mountainMask,
      largeCraterMask: large[1],
      smallCraterMask: small[1],
    })
  }

  const height = (direction: Vec3): number => sample(direction).height

  /**
   * 位移之后的法线，与着色器同式：在切平面上取四个邻点做有限差分。
   * 走在地面上时它决定「坡朝哪边」，所以必须和网格用同一个高度场。
   */
  const normal = (rawRadial: Vec3, epsilon = 0.0025, displacement = 1): Vec3 => {
    const radial = normalize(rawRadial)
    const helper: Vec3 = Math.abs(radial[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0]
    const tangent = normalize([
      radial[1] * helper[2] - radial[2] * helper[1],
      radial[2] * helper[0] - radial[0] * helper[2],
      radial[0] * helper[1] - radial[1] * helper[0],
    ])
    const bitangent = normalize([
      radial[1] * tangent[2] - radial[2] * tangent[1],
      radial[2] * tangent[0] - radial[0] * tangent[2],
      radial[0] * tangent[1] - radial[1] * tangent[0],
    ])
    const step = Math.max(epsilon, 0.0001)
    const offset = (axis: Vec3, sign: number): Vec3 =>
      normalize([radial[0] + axis[0] * step * sign, radial[1] + axis[1] * step * sign, radial[2] + axis[2] * step * sign])
    const lift = (point: Vec3): Vec3 => {
      const scale = 1 + height(point) * displacement
      return [point[0] * scale, point[1] * scale, point[2] * scale]
    }
    const a = lift(offset(tangent, 1)), b = lift(offset(tangent, -1))
    const c = lift(offset(bitangent, 1)), d = lift(offset(bitangent, -1))
    const dpT: Vec3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
    const dpB: Vec3 = [c[0] - d[0], c[1] - d[1], c[2] - d[2]]
    return normalize([
      dpT[1] * dpB[2] - dpT[2] * dpB[1],
      dpT[2] * dpB[0] - dpT[0] * dpB[2],
      dpT[0] * dpB[1] - dpT[1] * dpB[0],
    ])
  }

  return Object.freeze({ sample, height, normal })
}

export type PlanetTerrainField = ReturnType<typeof createTerrainField>
