/**
 * 渲染预算的相对回归比对。
 *
 * 这里刻意只认 maxRenderCostMs。p95FrameTime 是**调度间隔**：空闲时渲染循环
 * 节流到 30fps，它会被钉死在 43ms 附近，和一帧真正干了多少活无关。拿它去比
 * 「基线 × 1.2」，得到的是 43 <= 51.6 —— 一条永远不会红的门禁。
 */

/** 相对回归容差：实测渲染开销不得超过已提交基线的 1.2 倍。 */
export const RELATIVE_BUDGET_TOLERANCE = 1.2

/** 参与相对回归比对的质量档，顺序即报告顺序。 */
export const RELATIVE_BUDGET_TIERS = ['medium', 'low'] as const

export type BudgetTier = typeof RELATIVE_BUDGET_TIERS[number]

/** 一次采样里与预算有关的部分。基线是解析出来的 JSON，所以字段都是可选的。 */
export type RenderCostSample = {
  readonly maxRenderCostMs?: number | null
  /** 采样里确实带着它，但预算比对**故意不看**——理由见文件头。 */
  readonly p95FrameTime?: number
}

export type RenderCostByTier = Readonly<Partial<Record<BudgetTier, RenderCostSample | undefined>>>

export type BudgetViolation = {
  readonly quality: BudgetTier
  readonly measuredMs: number
  readonly baselineMs: number
  readonly allowedMs: number
}

const renderCostOf = (samples: RenderCostByTier, quality: BudgetTier, side: string): number => {
  const value = samples[quality]?.maxRenderCostMs
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${side} ${quality} has no measured maxRenderCostMs to compare`)
  }
  return value
}

/**
 * 逐档比对实测开销与已提交基线，返回**全部**越界项。
 * 任何一侧缺数字都直接抛错：静默跳过等于把门禁关掉。
 */
export function findRelativeBudgetViolations(
  measured: RenderCostByTier,
  baseline: RenderCostByTier,
): readonly BudgetViolation[] {
  return RELATIVE_BUDGET_TIERS.flatMap((quality) => {
    const baselineMs = renderCostOf(baseline, quality, 'committed baseline')
    const measuredMs = renderCostOf(measured, quality, 'measured run')
    const allowedMs = baselineMs * RELATIVE_BUDGET_TOLERANCE
    return measuredMs > allowedMs ? [{ quality, measuredMs, baselineMs, allowedMs }] : []
  })
}
