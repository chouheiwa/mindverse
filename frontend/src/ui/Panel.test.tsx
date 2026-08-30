import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { indexUniverse } from '../domain/universe'
import type { CurrentStar, CurrentUniverse, LegacyUniverse } from '../types'
import { Panel } from './Panel'

const star: CurrentStar = {
  id: 'star:v1:private:8ed3f6ad685b959e', scope: 'private', externalQueryAllowed: false,
  questionIds: ['question:7'], probeIds: ['article:21'], c: 'Alpha', g: 0, p: [0, 0, 0],
  n: 1, o: 0, f: 1, hue: 218, sat: 50, pe: 1, bu: 0, fi: '2026.01', la: '2026.01', ev: [],
}

const fixture: CurrentUniverse = {
  schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
  meta: { items: 1, concepts: 1, clusters: 1, own: 0, fav: 1, span: [1, 2], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [{ g: 0, name: 'Cluster', lead: 'Alpha', c: [0, 0, 0], n: 1, o: 0, f: 1, hue: 218, sat: 50, mem: ['Alpha'] }],
  stars: [star], particles: [], wormholes: [], solo: [], dark: [], nebula: [],
  questions: [{ id: 'question:7', questionId: '7', title: '真实问题标题', url: 'https://www.zhihu.com/question/7', answerIds: ['answer:8'] }],
  answers: [{ id: 'answer:8', questionId: 'question:7', title: '真实问题标题', url: 'https://www.zhihu.com/question/7/answer/8', bindings: [], discoverySources: ['public_search'] }],
  probes: [{ id: 'article:21', title: '真实文章标题', url: 'https://zhuanlan.zhihu.com/p/21', authorName: 'Alice', publishedAt: 1_788_192_000,
    likeCount: 12, commentCount: 3, favoriteCount: 4, bindings: [], discoverySources: ['public_search'] }],
}

function renderPanel(selectedStar: CurrentStar = star, shared = false) {
  const index = indexUniverse(fixture)
  const onEnterQuestion = vi.fn()
  render(<Panel universe={index.universe} index={index} star={selectedStar}
    onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={onEnterQuestion} shared={shared} />)
  return { onEnterQuestion }
}

afterEach(cleanup)

describe('Panel semantic entries', () => {
  test('renders each question and probe once and enters from its own trigger', async () => {
    const user = userEvent.setup()
    const repeated = { ...star, questionIds: ['question:7', 'question:7'], probeIds: ['article:21', 'article:21'] }
    const { onEnterQuestion } = renderPanel(repeated)
    const questions = screen.getByRole('region', { name: '问题行星' })
    expect(within(questions).getAllByText('真实问题标题')).toHaveLength(1)
    expect(within(questions).getByText('1 个已收录回答')).toBeInTheDocument()
    expect(within(questions).getByText('轨道 01')).toBeInTheDocument()
    const original = within(questions).getByRole('link', { name: '查看知乎原问题' })
    expect(original).toHaveAttribute('href', 'https://www.zhihu.com/question/7')
    expect(original).toHaveAttribute('rel', 'noopener noreferrer')
    const trigger = within(questions).getByRole('button', { name: '进入问题行星' })
    await user.click(trigger)
    expect(onEnterQuestion).toHaveBeenCalledTimes(1)
    expect(onEnterQuestion).toHaveBeenCalledWith('question:7', trigger)

    const probes = screen.getByRole('region', { name: '文章探测器 · 旁轨材料' })
    expect(within(probes).getAllByText('真实文章标题')).toHaveLength(1)
    expect(within(probes).getByRole('link', { name: '查看知乎原文章' })).toHaveAttribute('href', 'https://zhuanlan.zhihu.com/p/21')
    expect(within(probes).getByText(/Alice/)).toBeInTheDocument()
    expect(within(probes).getByText(/12 赞同/)).toBeInTheDocument()
    expect(within(probes).getByText('公开发现')).toBeInTheDocument()
    expect(within(probes).queryByText('我收藏')).not.toBeInTheDocument()
    expect(within(probes).queryByText('我创作')).not.toBeInTheDocument()
  })

  test('uses only bindings for personal labels and neutral copy without public discovery', () => {
    const bound = { ...fixture.probes![0], bindings: [{ relation: 'created' as const, folders: [] }, { relation: 'collected' as const, folders: ['阅读'] }] }
    const neutral = { ...fixture.probes![0], id: 'article:22', title: '中性文章', url: 'https://zhuanlan.zhihu.com/p/22', bindings: [], discoverySources: [] }
    const changed = { ...fixture, probes: [bound, neutral], stars: [{ ...star, probeIds: ['article:21', 'article:22'] }] }
    const index = indexUniverse(changed)
    render(<Panel universe={index.universe} index={index} star={index.universe.stars[0]}
      onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={() => {}} shared={false} />)
    const probes = screen.getByRole('region', { name: '文章探测器 · 旁轨材料' })
    expect(within(probes).getByText('我创作')).toBeInTheDocument()
    expect(within(probes).getByText('我收藏')).toBeInTheDocument()
    expect(within(probes).getByText('无个人关系')).toBeInTheDocument()
  })

  test('hides private provenance in shared mode and has no private exploration action', () => {
    const privateProbe = { ...fixture.probes![0], bindings: [{ relation: 'collected' as const, folders: ['私密夹'] }], discoverySources: ['favorite_list' as const] }
    const changed = { ...fixture, probes: [privateProbe] }
    const index = indexUniverse(changed)
    render(<Panel universe={index.universe} index={index} star={index.universe.stars[0]}
      onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={() => {}} shared />)
    expect(screen.queryByText('我收藏')).not.toBeInTheDocument()
    expect(screen.queryByText('私密夹')).not.toBeInTheDocument()
    expect(screen.queryByText('收藏列表发现')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /探索|搜索/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /探索|搜索/ })).not.toBeInTheDocument()
  })

  test('shows honest current empty states', () => {
    renderPanel({ ...star, questionIds: [], probeIds: [] })
    expect(screen.getByText('尚无已收录的问题行星。')).toBeInTheDocument()
    expect(screen.getByText('尚无已收录的文章探测器。')).toBeInTheDocument()
  })

  test('shows the same honest empty states for a legacy star', () => {
    const legacy: LegacyUniverse = {
      meta: fixture.meta, clusters: fixture.clusters!, stars: [{
        c: 'Legacy', g: 0, p: [0, 0, 0], n: 0, o: 0, f: 0, hue: 218, sat: 50,
        pe: 0, bu: 0, fi: '2026.01', la: '2026.01', ev: [],
      }], particles: [], wormholes: [], solo: [], dark: [], nebula: [],
    }
    const index = indexUniverse(legacy)
    render(<Panel universe={index.universe} index={index} star={index.universe.stars[0]}
      onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={() => {}} shared={false} />)
    expect(screen.getByText('尚无已收录的问题行星。')).toBeInTheDocument()
    expect(screen.getByText('尚无已收录的文章探测器。')).toBeInTheDocument()
  })

  test('bounds long question lists and reveals every entry on request', async () => {
    const user = userEvent.setup()
    const questions = Array.from({ length: 9 }, (_, index) => ({
      id: `question:${index + 1}`, questionId: String(index + 1), title: `问题 ${index + 1}`,
      url: `https://www.zhihu.com/question/${index + 1}`, answerIds: [],
    }))
    const changed = { ...fixture, questions, answers: [], stars: [{
      ...star, questionIds: questions.map(({ id }) => id), probeIds: [],
    }] }
    const index = indexUniverse(changed)
    render(<Panel universe={index.universe} index={index} star={index.universe.stars[0]}
      onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={() => {}} shared={false} />)
    const region = screen.getByRole('region', { name: '问题行星' })
    expect(within(region).getAllByRole('button', { name: '进入问题行星' })).toHaveLength(8)
    expect(within(region).queryByText('问题 9')).not.toBeInTheDocument()
    await user.click(within(region).getByRole('button', { name: '展开全部 9 个问题' }))
    expect(within(region).getAllByRole('button', { name: '进入问题行星' })).toHaveLength(9)
    expect(within(region).getByText('问题 9')).toBeInTheDocument()
  })
})
