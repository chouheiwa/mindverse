import type { ProbePart } from '../rendererContract'

// 文章探测器的机体定义，与 gl/probe.ts 同构。
//
// 它必须是一台**可辨认的航行器**：远景也是低多边形的三维机体（船身、两片翼、
// 信标），不是点、不是字、不是图标 —— 「旁轨材料」这个概念只有长成一艘船
// 才读得出来。近景再补上天线、推进器、铰链、缝线、扫描镜、灯带与蚀刻编号。
//
// 这里只描述形状与材质，不碰 Babylon —— 于是「机体有哪些部件、装在哪、什么
// 材质」可以在没有场景的情况下断言。

export type ProbeLod = 'far' | 'medium' | 'near'

/** 机体包围半径，用于把世界尺寸换成屏幕像素。 */
export const PROBE_RADIUS = 0.34

export type ProbeMaterialKey = 'hull' | 'panel' | 'amber' | 'metal' | 'lens' | 'light' | 'etching'

export interface ProbeMaterialSpec {
  readonly color: readonly [number, number, number]
  readonly metallic: number
  readonly roughness: number
  readonly emissive?: readonly [number, number, number]
  readonly emissiveIntensity?: number
  readonly doubleSided?: boolean
}

const rgb = (hex: number): readonly [number, number, number] => Object.freeze([
  ((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255,
] as const)

/** 科幻片的冷金属 + 琥珀信号灯，取值与 gl/probe.ts 逐字一致。 */
export const PROBE_MATERIALS: Readonly<Record<ProbeMaterialKey, ProbeMaterialSpec>> = Object.freeze({
  hull: Object.freeze({ color: rgb(0x536173), metallic: 0.72, roughness: 0.36 }),
  panel: Object.freeze({ color: rgb(0x253959), metallic: 0.56, roughness: 0.28 }),
  amber: Object.freeze({
    color: rgb(0xffa43a), metallic: 0.1, roughness: 0.28,
    emissive: rgb(0xff7818), emissiveIntensity: 1.8,
  }),
  metal: Object.freeze({ color: rgb(0x929eab), metallic: 0.84, roughness: 0.24 }),
  lens: Object.freeze({
    color: rgb(0x73bde8), metallic: 0.25, roughness: 0.12,
    emissive: rgb(0x12334c), emissiveIntensity: 0.8,
  }),
  light: Object.freeze({
    color: rgb(0xffb14c), metallic: 0.1, roughness: 0.22,
    emissive: rgb(0xff7b19), emissiveIntensity: 2.1,
  }),
  etching: Object.freeze({
    color: rgb(0xc5d1dc), metallic: 0.66, roughness: 0.3,
    emissive: rgb(0x152331), emissiveIntensity: 0.25, doubleSided: true,
  }),
})

export type ProbeShape =
  | { readonly kind: 'cylinder'; readonly diameterTop: number; readonly diameterBottom: number; readonly height: number; readonly tessellation: number }
  | { readonly kind: 'box'; readonly width: number; readonly height: number; readonly depth: number }
  | { readonly kind: 'sphere'; readonly diameter: number; readonly segments: number }
  | { readonly kind: 'cone'; readonly diameter: number; readonly height: number; readonly tessellation: number }
  | { readonly kind: 'torus'; readonly diameter: number; readonly thickness: number; readonly tessellation: number }
  | { readonly kind: 'disc'; readonly radius: number; readonly tessellation: number }

export interface ProbePartDefinition {
  readonly part: ProbePart
  readonly material: ProbeMaterialKey
  /** 机体局部坐标（x 沿航向）。 */
  readonly offset: readonly [number, number, number]
  /** 机体局部欧拉角。 */
  readonly rotation: readonly [number, number, number]
  readonly lod: ProbeLod
  readonly kind: ProbeShape['kind']
  readonly shape: ProbeShape
}

const HALF_PI = Math.PI / 2

function definition(
  part: ProbePart,
  material: ProbeMaterialKey,
  lod: ProbeLod,
  shape: ProbeShape,
  offset: readonly [number, number, number] = [0, 0, 0],
  rotation: readonly [number, number, number] = [0, 0, 0],
): ProbePartDefinition {
  return Object.freeze({ part, material, lod, kind: shape.kind, shape, offset, rotation })
}

/**
 * 部件表。`lod` 是这个部件**最早**出现的层级；更近的层级包含更远层级的一切。
 */
export const PROBE_PARTS: readonly ProbePartDefinition[] = Object.freeze([
  // ── 远景就能读出「这是一艘船」的四件 ──
  definition('hull', 'hull', 'far',
    { kind: 'cylinder', diameterTop: 0.36, diameterBottom: 0.36, height: 0.52, tessellation: 6 },
    [0, 0, 0], [0, 0, HALF_PI]),
  definition('left-wing', 'panel', 'far',
    { kind: 'box', width: 0.34, height: 0.025, depth: 0.24 }, [0, 0, -0.31]),
  definition('right-wing', 'panel', 'far',
    { kind: 'box', width: 0.34, height: 0.025, depth: 0.24 }, [0, 0, 0.31]),
  definition('beacon', 'amber', 'far',
    { kind: 'sphere', diameter: 0.11, segments: 8 }, [0, 0.22, 0]),

  // ── 中景补齐的机构件 ──
  definition('antenna', 'metal', 'medium',
    { kind: 'cylinder', diameterTop: 0.024, diameterBottom: 0.024, height: 0.28, tessellation: 6 },
    [0.05, 0.25, 0]),
  definition('thruster', 'metal', 'medium',
    { kind: 'cone', diameter: 0.20, height: 0.18, tessellation: 8 }, [-0.34, 0, 0], [0, 0, HALF_PI]),
  definition('left-hinge', 'metal', 'medium',
    { kind: 'cylinder', diameterTop: 0.07, diameterBottom: 0.07, height: 0.17, tessellation: 8 },
    [0, 0, -0.20], [HALF_PI, 0, 0]),
  definition('right-hinge', 'metal', 'medium',
    { kind: 'cylinder', diameterTop: 0.07, diameterBottom: 0.07, height: 0.17, tessellation: 8 },
    [0, 0, 0.20], [HALF_PI, 0, 0]),

  // ── 近景才值得画的细节 ──
  definition('seam', 'metal', 'near',
    { kind: 'torus', diameter: 0.362, thickness: 0.016, tessellation: 16 }, [0.05, 0, 0], [0, HALF_PI, 0]),
  definition('scanner-lens', 'lens', 'near',
    { kind: 'cylinder', diameterTop: 0.14, diameterBottom: 0.18, height: 0.08, tessellation: 12 },
    [0.12, 0, 0.20], [HALF_PI, 0, 0]),
  definition('light-strip-inner', 'light', 'near',
    { kind: 'box', width: 0.28, height: 0.012, depth: 0.018 }, [0.03, -0.17, 0]),
  definition('etching', 'etching', 'near',
    { kind: 'disc', radius: 0.075, tessellation: 4 }, [0.08, 0.01, -0.185], [HALF_PI, 0, 0]),
])

const LOD_ORDER: readonly ProbeLod[] = Object.freeze(['far', 'medium', 'near'])

/** 某个层级要绘制的全部部件（含更远层级的）。 */
export function partsForLod(lod: ProbeLod): readonly ProbePartDefinition[] {
  const depth = LOD_ORDER.indexOf(lod)
  return PROBE_PARTS.filter((definitionEntry) => LOD_ORDER.indexOf(definitionEntry.lod) <= depth)
}

function smoothstep(low: number, high: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - low) / Math.max(1e-6, high - low)))
  return t * t * (3 - 2 * t)
}

/** 迟滞阶梯，与 gl/probe.ts::nextProbeLod 同式。 */
export function nextProbeLod(current: ProbeLod, projectedRadiusPx: number): ProbeLod {
  const px = Number.isFinite(projectedRadiusPx) ? Math.max(0, projectedRadiusPx) : 0
  if (current === 'far') return px >= 28 ? 'medium' : 'far'
  if (current === 'medium') {
    if (px <= 14) return 'far'
    if (px >= 92) return 'near'
    return 'medium'
  }
  return px <= 76 ? 'medium' : 'near'
}

/** 相邻层级之间交叉淡入，切换不会是一次「跳变」。总和恒为 1。 */
export function probeLodWeights(
  lod: ProbeLod,
  projectedRadiusPx: number,
): Readonly<Record<ProbeLod, number>> {
  const px = Number.isFinite(projectedRadiusPx) ? Math.max(0, projectedRadiusPx) : 0
  if (lod === 'far') {
    const medium = smoothstep(20, 28, px)
    return Object.freeze({ far: 1 - medium, medium, near: 0 })
  }
  if (lod === 'medium' && px < 28) {
    const medium = smoothstep(14, 28, px)
    return Object.freeze({ far: 1 - medium, medium, near: 0 })
  }
  if ((lod === 'medium' && px > 76) || lod === 'near') {
    const near = smoothstep(76, 92, px)
    return Object.freeze({ far: 0, medium: 1 - near, near })
  }
  return Object.freeze({ far: 0, medium: 1, near: 0 })
}
