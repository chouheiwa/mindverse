import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { UniverseIndex } from '../domain/universe'
import type { CurrentUniverse } from '../types'
import { RenderFallback } from './RenderFallback'
import { initialUniverseUiState, universeUiReducer } from './explorationState'

const universe = {
  schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
  meta: { items: 2, concepts: 1, clusters: 1, own: 0, fav: 2, span: [1, 2], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [{ g: 0, name: '技术', lead: 'Alpha', c: [0, 0, 0], n: 1, o: 0, f: 2, hue: 218, sat: 50, mem: ['Alpha'] }],
  stars: [{ id: 'star:v1:private:8ed3f6ad685b959e', scope: 'private', externalQueryAllowed: false, questionIds: ['question:7'], probeIds: ['probe:9'], c: 'Alpha', g: 0, p: [0, 0, 0], n: 2, o: 0, f: 2, hue: 218, sat: 50, pe: 1, bu: 0, fi: '2026.01', la: '2026.01', ev: [] }],
  particles: [], wormholes: [], solo: [], dark: [], nebula: [],
  questions: [{ id: 'question:7', questionId: '7', title: '怎样画星空？', url: 'https://www.zhihu.com/question/7', answerIds: ['answer:8'] }],
  answers: [{ id: 'answer:8', questionId: 'question:7', title: '怎样画星空？', summary: '摘要', url: 'https://www.zhihu.com/question/7/answer/8', authorName: 'Alice', publishedAt: 1, bindings: [], discoverySources: ['public_search'] }],
  probes: [{ id: 'probe:9', title: 'WebGL 长文', summary: '文章摘要', url: 'https://zhuanlan.zhihu.com/p/9', authorName: 'Bob', publishedAt: 2, bindings: [], discoverySources: ['public_search'] }],
} satisfies CurrentUniverse

const index: UniverseIndex = {
  universe,
  starsById: new Map(universe.stars.map((item) => [item.id, item])),
  questionsById: new Map(universe.questions.map((item) => [item.id, item])),
  answersById: new Map(universe.answers.map((item) => [item.id, item])),
  probesById: new Map(universe.probes.map((item) => [item.id, item])),
}

describe('universe render state', () => {
  test('moves from loading to ready and then to a recoverable fallback', () => {
    expect(initialUniverseUiState.renderPhase).toBe('loading')
    const ready = universeUiReducer(initialUniverseUiState, { type: 'render-ready' })
    expect(ready.renderPhase).toBe('ready')
    const failed = universeUiReducer(ready, {
      type: 'render-failed', message: 'shader compile failed', recovery: 'remount',
    })
    expect(failed).toEqual({
      renderPhase: 'failed',
      exploration: { kind: 'render-fallback', message: 'shader compile failed', recovery: 'remount' },
    })
  })

  test('keeps navigation semantics in the same reducer root', () => {
    const selected = universeUiReducer(initialUniverseUiState, { type: 'set-star', star: universe.stars[0] })
    expect(selected.exploration).toMatchObject({ kind: 'universe', star: universe.stars[0] })
  })
})

test('offers retry, visitor mode, and a complete source-linked text navigation', () => {
  const retry = vi.fn()
  const seed = vi.fn()
  render(<RenderFallback index={index} message="shader compile failed" onRetry={retry} onSeed={seed} />)

  expect(screen.getByRole('heading', { name: '3D 星图暂时不可用' })).toBeVisible()
  expect(screen.getByText('shader compile failed')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '重试 3D' }))
  fireEvent.click(screen.getByRole('button', { name: /游客模式/ }))
  expect(retry).toHaveBeenCalledOnce()
  expect(seed).toHaveBeenCalledOnce()

  const nav = screen.getByRole('navigation', { name: '宇宙文本导航' })
  expect(within(nav).getByText('技术')).toBeVisible()
  expect(within(nav).getByText('Alpha')).toBeVisible()
  expect(within(nav).getByRole('link', { name: '怎样画星空？' })).toHaveAttribute('href', 'https://www.zhihu.com/question/7')
  expect(within(nav).getByRole('link', { name: /Alice.*回答原文/ })).toHaveAttribute('href', 'https://www.zhihu.com/question/7/answer/8')
  expect(within(nav).getByRole('link', { name: /WebGL 长文.*文章原文/ })).toHaveAttribute('href', 'https://zhuanlan.zhihu.com/p/9')
})
