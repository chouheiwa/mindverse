import { describe, expect, it } from 'vitest'
import {
  advanceSurfaceStage, IDLE_SURFACE_STAGE, surfaceSkyVisible, surfaceWalkEnabled,
  surfaceWorldVisible, type SurfaceStageState,
} from './surfaceStage'

const enter = (state: SurfaceStageState = IDLE_SURFACE_STAGE) =>
  advanceSurfaceStage(state, { kind: 'enter', questionId: 'question:7', landing: [0, 3, 0] })

describe('the surface stage is business logic, so it lives outside the frame loop', () => {
  it('enters by descending, with the landing site fixed up front', () => {
    const state = enter()
    expect(state.phase).toBe('descending')
    expect(state.questionId).toBe('question:7')
    expect(state.descent).toBe(0)
    // 落点在俯冲开始时就归一化定下，途中不再变。
    expect(Math.hypot(...state.landing!)).toBeCloseTo(1, 9)
  })

  it('walks only after it has landed', () => {
    const descending = enter()
    expect(surfaceWalkEnabled(descending)).toBe(false)
    const landed = advanceSurfaceStage(descending, { kind: 'landed', token: descending.token })
    expect(landed.phase).toBe('walking')
    expect(landed.descent).toBe(1)
    expect(surfaceWalkEnabled(landed)).toBe(true)
  })

  it('discards a late callback carrying a stale token', () => {
    // 迟到的帧回调会把新一次俯冲拽回旧进度 —— 这是取消语义里最容易漏的一条。
    const first = enter()
    const restarted = enter(first)
    expect(restarted.token).toBe(first.token + 1)
    for (const event of [
      { kind: 'descend' as const, token: first.token, progress: 0.9 },
      { kind: 'landed' as const, token: first.token },
      { kind: 'dig' as const, token: first.token },
    ]) {
      expect(advanceSurfaceStage(restarted, event)).toBe(restarted)
    }
  })

  it('refuses to dig while still falling', () => {
    // 俯冲途中下潜会同时跑两套相机。
    const descending = enter()
    expect(advanceSurfaceStage(descending, { kind: 'dig', token: descending.token })).toBe(descending)
  })

  it('digs down and comes back up to the surface', () => {
    const walking = advanceSurfaceStage(enter(), { kind: 'landed', token: 1 })
    const digging = advanceSurfaceStage(walking, { kind: 'dig', token: walking.token })
    expect(digging.phase).toBe('digging')
    expect(surfaceSkyVisible(digging)).toBe(false)
    // 洞穴有自己的墙 —— 外面再裹一层地形会把地层的明暗分层压平。
    expect(surfaceWorldVisible(digging)).toBe(false)
    const back = advanceSurfaceStage(digging, { kind: 'surfaced', token: digging.token })
    expect(back.phase).toBe('walking')
    expect(surfaceSkyVisible(back)).toBe(true)
  })

  it('can always leave, including mid-descent', () => {
    // 俯冲途中退出必须回到轨道，不能卡在半空。
    for (const state of [
      enter(),
      advanceSurfaceStage(enter(), { kind: 'landed', token: 1 }),
      advanceSurfaceStage(advanceSurfaceStage(enter(), { kind: 'landed', token: 1 }), { kind: 'dig', token: 1 }),
    ]) {
      expect(advanceSurfaceStage(state, { kind: 'exit' })).toEqual(IDLE_SURFACE_STAGE)
    }
    expect(advanceSurfaceStage(IDLE_SURFACE_STAGE, { kind: 'exit' })).toBe(IDLE_SURFACE_STAGE)
  })

  it('clamps descent progress and reports no change identically', () => {
    const descending = enter()
    expect(advanceSurfaceStage(descending, { kind: 'descend', token: 1, progress: 2 }).descent).toBe(1)
    expect(advanceSurfaceStage(descending, { kind: 'descend', token: 1, progress: -1 }).descent).toBe(0)
    expect(advanceSurfaceStage(descending, { kind: 'descend', token: 1, progress: Number.NaN }).descent).toBe(0)
    // 进度没变时返回原对象，调用方可以用引用相等跳过重绘。
    expect(advanceSurfaceStage(descending, { kind: 'descend', token: 1, progress: 0 })).toBe(descending)
  })

  it('shows the world and sky only where they belong', () => {
    expect(surfaceWorldVisible(IDLE_SURFACE_STAGE)).toBe(false)
    expect(surfaceSkyVisible(IDLE_SURFACE_STAGE)).toBe(false)
    const descending = enter()
    expect(surfaceWorldVisible(descending)).toBe(true)
    expect(surfaceSkyVisible(descending)).toBe(true)
  })

  it('ignores an enter without a question id', () => {
    expect(advanceSurfaceStage(IDLE_SURFACE_STAGE, {
      kind: 'enter', questionId: '', landing: [0, 1, 0],
    })).toBe(IDLE_SURFACE_STAGE)
  })

  it('survives a degenerate landing direction', () => {
    const state = advanceSurfaceStage(IDLE_SURFACE_STAGE, {
      kind: 'enter', questionId: 'q', landing: [0, 0, 0],
    })
    expect(Math.hypot(...state.landing!)).toBeCloseTo(1, 9)
  })
})
