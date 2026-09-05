import { describe, expect, it } from 'vitest'
import { findRelativeBudgetViolations, RELATIVE_BUDGET_TOLERANCE } from './renderBudget'

/**
 * 空闲时渲染循环节流到 30fps，p95FrameTime 会被钉在 43ms 附近，无论渲染开销涨到多少。
 * 所有用例都把两侧的 p95 设成同一个 43，逼迫门禁只能靠 maxRenderCostMs 判断。
 */
const cost = (maxRenderCostMs: number) => ({ maxRenderCostMs, p95FrameTime: 43 })

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
})
