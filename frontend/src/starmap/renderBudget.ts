/**
 * 渲染预算的相对回归比对。
 *
 * 这里刻意只认 p95RenderCostMs —— 采样窗内逐帧渲染开销的 95 分位。另外两个
 * 数字都不能用：
 *
 * - `p95FrameTime` 是**调度间隔**：空闲时渲染循环节流到 30fps，它被钉死在
 *   43ms 附近，和一帧真正干了多少活无关。拿它比「基线 × 1.2」得到的是
 *   43 <= 51.6，一条永远不会红的门禁。
 * - `maxRenderCostMs` 是**极值统计**：260 个样本里任意一帧的 GC、合成器抖动
 *   或 OS 调度都能支配它。稳态每帧约 1ms 时实测离散度达 54~67%，远超 20%
 *   容差，门禁会持续假红——红的是运气不是代码。
 *
 * p95 丢掉最高的约 5% 样本，既保留「最坏情况」的语义，又不被单帧支配。
 */

/** 相对回归容差：实测渲染开销不得超过已提交基线的 1.2 倍。 */
export const RELATIVE_BUDGET_TOLERANCE = 1.2

/**
 * 噪声下限。Chrome 把 `performance.now()` 量化到 0.1ms，稳态 p95 落在 1.2~1.6ms
 * 时一个量化步就占 7%，三个步顶穿 20% —— 那时门禁判的是计时器分辨率，不是代码。
 *
 * 允许上限取 `max(基线 × 1.2, 基线 + 0.5ms)`：基线一旦超过 2.5ms，相对规则重新
 * 接管（2.5 × 1.2 = 3.0 = 2.5 + 0.5），下限对有意义的量级不产生任何放宽。
 * 同一手法在 `comparePlanetSample` 里已经用过：`max(0.015, |ref| × 0.5)`。
 */
export const RELATIVE_BUDGET_NOISE_FLOOR_MS = 0.5

/** 参与相对回归比对的质量档，顺序即报告顺序。 */
export const RELATIVE_BUDGET_TIERS = ['medium', 'low'] as const

export type BudgetTier = typeof RELATIVE_BUDGET_TIERS[number]

/** 一次采样里与预算有关的部分。基线是解析出来的 JSON，所以字段都是可选的。 */
export type RenderCostSample = {
  readonly p95RenderCostMs?: number | null
  /** 页内量到的首帧时刻（相对导航起点），即首屏可交互时间。 */
  readonly firstInteractiveMs?: number | null
  /** 两者采样里都带着，但预算比对**故意都不看**——理由见文件头。 */
  readonly maxRenderCostMs?: number | null
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
  const value = samples[quality]?.p95RenderCostMs
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${side} ${quality} has no measured p95RenderCostMs to compare`)
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
    const allowedMs = Math.max(
      baselineMs * RELATIVE_BUDGET_TOLERANCE,
      baselineMs + RELATIVE_BUDGET_NOISE_FLOOR_MS,
    )
    return measuredMs > allowedMs ? [{ quality, measuredMs, baselineMs, allowedMs }] : []
  })
}

/**
 * 首屏可交互的绝对天花板。
 *
 * 这条规则原本只活在 `compare:render-baselines` 的 legacy 分支里，那对基线冻结
 * 于 2026-09-02 且已无采集入口（见审计报告 §15.5）。退役那条门禁不能顺手把它
 * 唯一独有的检查一起丢掉，所以搬到这里。
 *
 * **但不能照抄它的「相对基线 30%」**：那对基线是同一次会话里前后脚采的，而这里
 * 比的是几天前提交的基线与此刻的实测。同机实测首屏在 492~1705ms 之间随内存
 * 压力波动逾两倍，任何相对容差都只会得到一条随运气变色的门禁。
 *
 * 天花板闸住的是「首屏卡住」那一类真回归（`ef19b54 eliminate panorama startup
 * stalls` 就是这一类），代价是分辨不出温和退化 —— 这是这个量能诚实承诺的上限。
 *
 * 量的是**页内** `performance.now()` 的首帧时刻，不是测试进程的墙钟 —— 后者混
 * 进 CDP 往返，正是 §15.2 修掉的那类错误。
 */
export const STARTUP_CEILING_MS = 3_000

const startupOf = (samples: RenderCostByTier, quality: BudgetTier, side: string): number => {
  const value = samples[quality]?.firstInteractiveMs
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${side} ${quality} has no measured firstInteractiveMs to compare`)
  }
  return value
}

/** 逐档比对首屏可交互时间与天花板，返回**全部**越界项。缺数字直接抛错。 */
export function findStartupCeilingViolations(
  measured: RenderCostByTier,
  ceilingMs: number = STARTUP_CEILING_MS,
): readonly BudgetViolation[] {
  return RELATIVE_BUDGET_TIERS.flatMap((quality) => {
    const measuredMs = startupOf(measured, quality, 'measured run')
    return measuredMs > ceilingMs
      ? [{ quality, measuredMs, baselineMs: ceilingMs, allowedMs: ceilingMs }]
      : []
  })
}
