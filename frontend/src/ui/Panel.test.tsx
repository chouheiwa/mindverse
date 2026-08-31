import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
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
  const onInspectProbe = vi.fn()
  render(<Panel universe={index.universe} index={index} star={selectedStar}
    onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={onEnterQuestion}
    onInspectProbe={onInspectProbe} shared={shared} />)
  return { onEnterQuestion, onInspectProbe }
}

afterEach(cleanup)

describe('Panel semantic entries', () => {
  test('renders each question and probe once and enters from its own trigger', async () => {
    const user = userEvent.setup()
    const repeated = { ...star, questionIds: ['question:7', 'question:7'], probeIds: ['article:21', 'article:21'] }
    const { onEnterQuestion, onInspectProbe } = renderPanel(repeated)
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
    expect(screen.getByRole('complementary')).not.toHaveAttribute('aria-live')
    expect(within(probes).getAllByText('真实文章标题')).toHaveLength(1)
    expect(within(probes).getByRole('link', { name: '查看知乎原文章' })).toHaveAttribute('href', 'https://zhuanlan.zhihu.com/p/21')
    const inspect = within(probes).getByRole('button', { name: '检查探测器' })
    await user.click(inspect)
    expect(onInspectProbe).toHaveBeenCalledWith(repeated, fixture.probes![0], inspect)
    expect(within(probes).getByText(/Alice/)).toBeInTheDocument()
    expect(within(probes).getByText(/12 赞同/)).toBeInTheDocument()
    expect(within(probes).getByText('公开发现')).toBeInTheDocument()
    expect(within(probes).queryByText('我收藏')).not.toBeInTheDocument()
    expect(within(probes).queryByText('我创作')).not.toBeInTheDocument()
  })

  test('uses only bindings for personal labels and neutral copy without public discovery', () => {
    const bound = { ...fixture.probes![0], bindings: [{ relation: 'created' as const, folders: [] }, { relation: 'collected' as const, folders: ['阅读'] }] }
    const neutral = { ...fixture.probes![0], id: 'article:22', title: '中性文章', url: 'https://zhuanlan.zhihu.com/p/22', publishedAt: 0, bindings: [], discoverySources: [] }
    const changed = { ...fixture, probes: [bound, neutral], stars: [{ ...star, probeIds: ['article:21', 'article:22'] }] }
    const index = indexUniverse(changed)
    render(<Panel universe={index.universe} index={index} star={index.universe.stars[0]}
      onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={() => {}} onInspectProbe={() => {}} shared={false} />)
    const probes = screen.getByRole('region', { name: '文章探测器 · 旁轨材料' })
    expect(within(probes).getByText('我创作')).toBeInTheDocument()
    expect(within(probes).getByText('我收藏')).toBeInTheDocument()
    expect(within(probes).getByText('未发现可证明的个人关系')).toBeInTheDocument()
    const neutralRow = screen.getByText('中性文章').closest('li')!
    expect(within(neutralRow).getByText('首发时间未知').tagName).toBe('SPAN')
    expect(neutralRow.querySelector('time')).toBeNull()
  })

  test('fails closed without mounting private data in shared mode', () => {
    const privateEvidence = { t: 'PRIVATE_EVIDENCE_SENTINEL', u: 'https://private-evidence.test/item', o: 1, y: '26.01' }
    const changed = {
      ...fixture,
      meta: { ...fixture.meta, own: 1, fav: 0 },
      clusters: [{ ...fixture.clusters![0], name: 'PRIVATE_CLUSTER_SENTINEL', o: 1, f: 0 }],
      stars: [{ ...star, n: 1, o: 1, f: 0, ev: [privateEvidence] }],
      dark: [{ c: 'Alpha', n: 1, f: 0, o: 1, gap: 99, first: 'PRIVATE_FIRST', last: 'PRIVATE_LAST', ev: [privateEvidence] }],
    }
    const index = indexUniverse(changed)
    const { container } = render(<Panel universe={index.universe} index={index} star={index.universe.stars[0]}
      onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={() => {}} onInspectProbe={() => {}} shared />)
    expect(container).toBeEmptyDOMElement()
  })

  test('does not mount an offscreen close button or tab target without a star', () => {
    const index = indexUniverse(fixture)
    const { container } = render(<Panel universe={index.universe} index={index} star={null}
      onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={() => {}} onInspectProbe={() => {}} shared={false} />)
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
  })

  test('shows honest current empty states', () => {
    renderPanel({ ...star, questionIds: [], probeIds: [] })
    expect(screen.getByText('尚无已收录的问题行星。')).toBeInTheDocument()
    expect(screen.getByText('尚无已收录的文章探测器。')).toBeInTheDocument()
  })

  test('describes seed stars as public sample directions without personal claims', () => {
    const seedUniverse = {
      ...fixture,
      meta: { ...fixture.meta, source: 'seed', span: [0, 0] as [number, number] },
      stars: [{ ...star, o: 1, f: 1, ev: [{ t: '公开样本', u: 'https://www.zhihu.com/question/7', o: 1, y: '26.01' }] }],
    }
    const index = indexUniverse(seedUniverse)
    render(<Panel universe={index.universe} index={index} star={index.universe.stars[0]}
      onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={() => {}} onInspectProbe={() => {}} shared={false} />)
    expect(screen.getAllByText(/公开样本内容/).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: '构成它的公开样本内容' })).toBeVisible()
    expect(screen.queryByText(/我创作|我收藏|个人内容档案|个人关系/)).not.toBeInTheDocument()
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
      onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={() => {}} onInspectProbe={() => {}} shared={false} />)
    expect(screen.getByText('尚无已收录的问题行星。')).toBeInTheDocument()
    expect(screen.getByText('尚无已收录的文章探测器。')).toBeInTheDocument()
  })

  test.each([20, 100, 512])('paginates all %i questions eight at a time without dropping access', (total) => {
    const questions = Array.from({ length: total }, (_, index) => ({
      id: `question:${index + 1}`, questionId: String(index + 1), title: `问题 ${index + 1}`,
      url: `https://www.zhihu.com/question/${index + 1}`, answerIds: [],
    }))
    const changed = { ...fixture, questions, answers: [], stars: [{
      ...star, questionIds: questions.map(({ id }) => id).sort(), probeIds: [],
    }] }
    const index = indexUniverse(changed)
    render(<Panel universe={index.universe} index={index} star={index.universe.stars[0]}
      onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={() => {}} onInspectProbe={() => {}} shared={false} />)
    const region = screen.getByRole('region', { name: '问题行星' })
    expect(region.querySelectorAll('.entry-actions button')).toHaveLength(8)
    let shown = 8
    while (shown < total) {
      const firstNew = shown
      fireEvent.click(region.querySelector<HTMLButtonElement>('.entry-more')!)
      shown = Math.min(shown + 8, total)
      const actions = region.querySelectorAll<HTMLButtonElement>('.entry-actions button')
      expect(actions).toHaveLength(shown)
      expect(actions[firstNew]).toHaveFocus()
      expect(region.querySelector('.entry-status')).toHaveTextContent(`已显示 ${shown} 项，共 ${total} 项`)
    }
    expect(region.querySelector('.entry-more')).toBeNull()
  })

  test('paginates probes incrementally and uses semantic Shanghai publication dates', async () => {
    const user = userEvent.setup()
    const probes = Array.from({ length: 20 }, (_, index) => ({
      ...fixture.probes![0], id: `article:${index + 1}`, title: `文章 ${index + 1}`,
      url: `https://zhuanlan.zhihu.com/p/${index + 1}`,
    }))
    const changed = { ...fixture, probes, stars: [{
      ...star, questionIds: [], probeIds: probes.map(({ id }) => id).sort(),
    }] }
    const index = indexUniverse(changed)
    render(<Panel universe={index.universe} index={index} star={index.universe.stars[0]}
      onClose={() => {}} onPickConcept={() => {}} onEnterQuestion={() => {}} onInspectProbe={() => {}} shared={false} />)
    const region = screen.getByRole('region', { name: '文章探测器 · 旁轨材料' })
    expect(within(region).getAllByRole('link', { name: '查看知乎原文章' })).toHaveLength(8)
    await user.click(within(region).getByRole('button', { name: '加载更多文章' }))
    expect(within(region).getAllByRole('link', { name: '查看知乎原文章' })).toHaveLength(16)
    expect(within(region).getAllByRole('button', { name: '检查探测器' })[8]).toHaveFocus()
    await user.click(within(region).getByRole('button', { name: '加载更多文章' }))
    expect(within(region).getAllByRole('button', { name: '检查探测器' })[16]).toHaveFocus()
    expect(within(region).queryByRole('button', { name: '加载更多文章' })).not.toBeInTheDocument()
    expect(within(region).getByRole('status')).toHaveTextContent('已显示 20 项，共 20 项')
    const published = within(region).getAllByText(/2026年9月1日/)[0]
    expect(published.tagName).toBe('TIME')
    expect(published).toHaveAttribute('datetime', '2026-09-01')
  })

  test('resets pagination when the selected star identity changes', async () => {
    const user = userEvent.setup()
    const questions = Array.from({ length: 20 }, (_, index) => ({
      id: `question:${index + 1}`, questionId: String(index + 1), title: `问题 ${index + 1}`,
      url: `https://www.zhihu.com/question/${index + 1}`, answerIds: [],
    }))
    const first = { ...star, questionIds: questions.map(({ id }) => id).sort(), probeIds: [] }
    const second = { ...first, id: 'star:v1:private:another' }
    const changed = { ...fixture, questions, answers: [], stars: [first] }
    const index = indexUniverse(changed)
    const props = { universe: index.universe, index, onClose: () => {}, onPickConcept: () => {}, onEnterQuestion: () => {}, onInspectProbe: () => {}, shared: false }
    const view = render(<Panel {...props} star={first} />)
    await user.click(screen.getByRole('button', { name: '加载更多问题' }))
    expect(screen.getAllByRole('button', { name: '进入问题行星' })).toHaveLength(16)
    view.rerender(<Panel {...props} star={second} />)
    expect(screen.getAllByRole('button', { name: '进入问题行星' })).toHaveLength(8)
  })
})
