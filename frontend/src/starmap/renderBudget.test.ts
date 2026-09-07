import { describe, expect, it } from 'vitest'
import {
  findRelativeBudgetViolations,
  RELATIVE_BUDGET_NOISE_FLOOR_MS,
  RELATIVE_BUDGET_TOLERANCE,
  findStartupCeilingViolations,
  STARTUP_CEILING_MS,
} from './renderBudget'

/**
 * 空闲时渲染循环节流到 30fps，p95FrameTime 会被钉在 43ms 附近，无论渲染开销涨到多少。
 * 所有用例都把两侧的 p95 设成同一个 43，逼迫门禁只能靠渲染开销判断。
 *
 * `maxRenderCostMs` 跟着走但**故意给成 p95 的 3 倍**：它是极值统计，采样窗里
 * 一帧抖动就能支配它；门禁看的必须是 p95。
 */
const cost = (p95RenderCostMs: number) => ({
  p95RenderCostMs, maxRenderCostMs: p95RenderCostMs * 3, p95FrameTime: 43,
})

describe('the relative render budget measures work, not the throttled frame interval', () => {
  it('catches a doubled render cost even though the frame interval never moves', () => {
    const baseline = { medium: cost(12.2), low: cost(9.7) }
    const measured = { medium: cost(24.4), low: cost(9.7) }

    const violations = findRelativeBudgetViolations(measured, baseline)

    expect(violations).toHaveLength(1)
    expect(violations[0]).toMatchObject({ quality: 'medium', measuredMs: 24.4, baselineMs: 12.2 })
    // 容差是乘在基线上的，越界的判据必须是这个乘积。
    expect(violations[0].allowedMs).toBeCloseTo(12.2 * RELATIVE_BUDGET_TOLERANCE, 10)
  })

  it('lets a run that stays inside the tolerance through', () => {
    const baseline = { medium: cost(12.2), low: cost(9.7) }
    const measured = { medium: cost(12.2 * RELATIVE_BUDGET_TOLERANCE), low: cost(9.7 * 1.1) }

    expect(findRelativeBudgetViolations(measured, baseline)).toEqual([])
  })

  it('names every tier that regressed, not just the first one', () => {
    const baseline = { medium: cost(12.2), low: cost(9.7) }
    const measured = { medium: cost(30), low: cost(40) }

    expect(findRelativeBudgetViolations(measured, baseline).map(({ quality }) => quality))
      .toEqual(['medium', 'low'])
  })

  it('ignores a single hitchy frame that only moves the peak', () => {
    // 稳态每帧约 1ms 时，一帧 40ms 的抖动能把 max 顶到基线的 30 倍。
    // p95 在 260 个样本里丢掉最高的约 13 个，同样的抖动不改变判定。
    const baseline = { medium: cost(1.1), low: cost(1.0) }
    const measured = {
      medium: { ...cost(1.15), maxRenderCostMs: 40 },
      low: { ...cost(1.05), maxRenderCostMs: 38 },
    }

    expect(findRelativeBudgetViolations(measured, baseline)).toEqual([])
  })

  it('still catches a regression when the whole distribution shifts up', () => {
    // 1.1 → 2.0 超过噪声下限给的 1.6，不是量化步能解释的量。
    const baseline = { medium: cost(1.1), low: cost(1.0) }
    const measured = { medium: cost(2.0), low: cost(1.0) }

    expect(findRelativeBudgetViolations(measured, baseline).map(({ quality }) => quality))
      .toEqual(['medium'])
  })

  it('refuses to compare a baseline that carries only the old peak', () => {
    const baseline = { medium: { maxRenderCostMs: 12.2 }, low: { maxRenderCostMs: 9.7 } }
    const measured = { medium: cost(1.1), low: cost(1.0) }

    expect(() => findRelativeBudgetViolations(measured, baseline)).toThrow(/p95RenderCostMs/)
  })

  it('refuses to compare when the measured run reports no render cost', () => {
    const baseline = { medium: cost(12.2), low: cost(9.7) }
    const measured = { medium: { p95FrameTime: 43 }, low: cost(9.7) }

    // 缺数字必须炸，不能当成「没超标」——那正是上一版门禁形同虚设的原因。
    expect(() => findRelativeBudgetViolations(measured, baseline)).toThrow(/medium/)
  })

  it('refuses to compare against a baseline that predates render-cost capture', () => {
    const baseline = { medium: cost(12.2), low: { p95FrameTime: 43 } }
    const measured = { medium: cost(12.2), low: cost(9.7) }

    expect(() => findRelativeBudgetViolations(measured, baseline)).toThrow(/low/)
  })

  it('holds the tolerance at 20% so a captured baseline stays the reference', () => {
    expect(RELATIVE_BUDGET_TOLERANCE).toBe(1.2)
  })

  it('does not let timer quantisation decide a sub-millisecond budget', () => {
    // Chrome 把 performance.now() 量化到 0.1ms。稳态 p95 在 1.2~1.6ms 之间时，
    // 一个量化步就是 7%，三个步顶穿 20% —— 红的是分辨率不是代码。
    // 实测同机连采五次，p95 在 1.20~1.60ms 之间跳；基线若落在区间下沿，
    // 单纯 ×1.2 得到 1.44，同一台机器的下一次采样就会红。
    const baseline = { medium: cost(1.2), low: cost(1.2) }
    const measured = { medium: cost(1.6), low: cost(1.5) }

    expect(findRelativeBudgetViolations(measured, baseline)).toEqual([])
  })

  it('still fails a doubling at the same sub-millisecond scale', () => {
    const baseline = { medium: cost(1.2), low: cost(1.2) }
    const measured = { medium: cost(2.8), low: cost(1.2) }

    expect(findRelativeBudgetViolations(measured, baseline).map(({ quality }) => quality))
      .toEqual(['medium'])
  })

  it('keeps the relative rule in charge once the baseline outgrows the noise floor', () => {
    // 基线 12.2ms 时 12.2×1.2 = 14.64 已经远大于 12.2 + 0.5，噪声下限不再起作用。
    const baseline = { medium: cost(12.2), low: cost(9.7) }
    const measured = { medium: cost(12.8), low: cost(9.7) }

    expect(findRelativeBudgetViolations(measured, baseline)).toEqual([])
    expect(findRelativeBudgetViolations({ medium: cost(15), low: cost(9.7) }, baseline)
      .map(({ quality }) => quality)).toEqual(['medium'])
  })

  it('publishes the noise floor so the baseline capture can be judged against it', () => {
    expect(RELATIVE_BUDGET_NOISE_FLOOR_MS).toBe(0.5)
  })
})

describe('the startup budget keeps the retired legacy pair’s only unique check alive', () => {
  const startup = (firstInteractiveMs: number) => ({ firstInteractiveMs })

  it('passes a startup that stays under the ceiling', () => {
    expect(findStartupCeilingViolations({ medium: startup(492), low: startup(1705) })).toEqual([])
  })

  it('names every tier that blew the ceiling', () => {
    const measured = { medium: startup(3400), low: startup(1200) }

    expect(findStartupCeilingViolations(measured)).toEqual([{
      quality: 'medium',
      measuredMs: 3400,
      baselineMs: STARTUP_CEILING_MS,
      allowedMs: STARTUP_CEILING_MS,
    }])
  })

  it('refuses to compare when a run never measured a first frame', () => {
    expect(() => findStartupCeilingViolations({ medium: {}, low: startup(900) }))
      .toThrow(/firstInteractiveMs/)
  })

  it('holds a ceiling that a stall trips but ordinary load variance does not', () => {
    // 同机实测 492~1705ms，随内存压力波动逾两倍；相对比对在这个量上分辨不出
    // 30%。天花板要闸住的是「首屏卡住」那一类（见 ef19b54），不是日常抖动。
    expect(STARTUP_CEILING_MS).toBe(3_000)
  })
})
