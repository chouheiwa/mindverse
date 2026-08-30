import { StrictMode, useRef, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { AnswerSatellite, QuestionPlanet, Universe } from '../types'
import type { UniverseIndex } from '../domain/universe'
import { QuestionWorkspace } from './QuestionWorkspace'

const day = 86_400
const question: QuestionPlanet = { id: 'question:7', questionId: '7', title: '真实问题标题', url: 'https://www.zhihu.com/question/7', answerIds: [] }
const answer = (id: string, overrides: Partial<AnswerSatellite> = {}): AnswerSatellite => ({
  id, questionId: question.id, title: `回答 ${id}`, summary: `摘要 ${id}`,
  url: `https://www.zhihu.com/question/7/answer/${id.split(':')[1]}`,
  bindings: [], discoverySources: [], ...overrides,
})
function index(answers: AnswerSatellite[], ids = answers.map((item) => item.id)): UniverseIndex {
  const q = { ...question, answerIds: ids }
  return { universe: {} as Universe, starsById: new Map(), questionsById: new Map([[q.id, q]]), answersById: new Map(answers.map((item) => [item.id, item])), probesById: new Map() }
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})
afterEach(cleanup)

describe('QuestionWorkspace', () => {
  test('shows exact question, canonical links, sample provenance, and distinguishes personal relations', () => {
    const answers = [
      answer('answer:1', { authorName: 'Alice', bindings: [{ relation: 'created', folders: [] }] }),
      answer('answer:2', { authorName: 'Bob', bindings: [{ relation: 'collected', folders: ['再读'] }] }),
    ]
    render(<QuestionWorkspace index={index(answers)} questionId={question.id} onBack={() => {}} onRestoreCamera={() => {}} />)
    expect(screen.getByRole('heading', { name: question.title })).toBeVisible()
    expect(screen.getByRole('link', { name: '知乎原问题' })).toHaveAttribute('href', question.url)
    expect(screen.getByText(/当前样本/)).toBeVisible()
    expect(screen.getByText('2 个当前可访问回答')).toBeVisible()
    expect(screen.getByRole('tab', { name: '个人轨道' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: '我创作' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '我收藏' })).toBeVisible()
    expect(screen.queryByText(/认同/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Alice/ })).toHaveAttribute('href', answers[0].url)
    expect(screen.getByRole('link', { name: /Bob/ })).toHaveAttribute('href', answers[1].url)
  })

  test('teaches what OAuth evidence proves in an empty personal orbit', () => {
    render(<QuestionWorkspace index={index([answer('answer:1', { discoverySources: ['favorite_list', 'own_content'] })])} questionId={question.id} onBack={() => {}} onRestoreCamera={() => {}} />)
    expect(screen.getByText(/只有 OAuth 返回的创作或收藏绑定/)).toBeVisible()
    expect(screen.getByText(/公开搜索、收藏列表发现或本人内容发现都不能单独证明个人关系/)).toBeVisible()
  })

  test('uses ARIA tabs with roving keyboard focus and no focus loss', async () => {
    const user = userEvent.setup()
    render(<QuestionWorkspace index={index([])} questionId={question.id} onBack={() => {}} onRestoreCamera={() => {}} />)
    const personal = screen.getByRole('tab', { name: '个人轨道' })
    personal.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: '回溯' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: '回溯' })).toHaveAttribute('aria-selected', 'true')
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('tab', { name: '棱镜' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('tab', { name: '回溯' })).toHaveFocus()
    await user.keyboard('{End}')
    expect(screen.getByRole('tab', { name: '棱镜' })).toHaveFocus()
    await user.keyboard('{Home}')
    expect(personal).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: '棱镜' })).toHaveFocus()
    await user.click(screen.getByRole('tab', { name: '回溯' }))
    expect(screen.getByRole('tab', { name: '回溯' })).toHaveFocus()
    expect(screen.getByRole('tabpanel', { name: '回溯' })).toBeVisible()
  })

  test.each([{ shared: true }, { readOnly: true }])('in public mode %o defaults to retrospective and renders no private orbit tab, panel, or copy', (mode) => {
    render(<QuestionWorkspace {...mode} index={index([answer('answer:1', { bindings: [{ relation: 'created', folders: [] }] })])} questionId={question.id} onBack={() => {}} onRestoreCamera={() => {}} />)
    expect(screen.queryByRole('tab', { name: '个人轨道' })).not.toBeInTheDocument()
    expect(screen.queryByText('我创作')).not.toBeInTheDocument()
    expect(screen.queryByText('我收藏')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '回溯' })).toHaveAttribute('aria-selected', 'true')
  })

  test('keeps a valid focused tab and panel while privacy mode changes in place', async () => {
    const source = index([answer('answer:1', { bindings: [{ relation: 'created', folders: ['私密目录'] }] })])
    const props = { index: source, questionId: question.id, onBack: () => {}, onRestoreCamera: () => {} }
    const view = render(<QuestionWorkspace {...props} />)
    screen.getByRole('tab', { name: '个人轨道' }).focus()

    view.rerender(<QuestionWorkspace {...props} shared />)
    expect(screen.queryByRole('tab', { name: '个人轨道' })).not.toBeInTheDocument()
    const retrospective = screen.getByRole('tab', { name: '回溯' })
    expect(retrospective).toHaveAttribute('aria-selected', 'true')
    expect(retrospective).toHaveAttribute('aria-controls', 'qw-panel-retrospective')
    expect(screen.getByRole('tabpanel', { name: '回溯' })).toHaveAttribute('id', 'qw-panel-retrospective')
    expect(screen.queryByText('我创作')).not.toBeInTheDocument()
    expect(screen.queryByText('私密目录')).not.toBeInTheDocument()
    await waitFor(() => expect(retrospective).toHaveFocus())

    view.rerender(<QuestionWorkspace {...props} />)
    const personal = screen.getByRole('tab', { name: '个人轨道' })
    expect(personal).toHaveAttribute('aria-selected', 'true')
    expect(personal).toHaveAttribute('aria-controls', 'qw-panel-personal')
    expect(screen.getByRole('tabpanel', { name: '个人轨道' })).toHaveAttribute('id', 'qw-panel-personal')
    expect(personal).toHaveFocus()
  })

  test('shows only thresholds and original links when chronicle evidence is insufficient', async () => {
    const user = userEvent.setup()
    const unknown = answer('answer:1', { updatedAt: 1_900_000_000, observedAt: 2_000_000_000 })
    render(<QuestionWorkspace index={index([unknown])} questionId={question.id} onBack={() => {}} onRestoreCamera={() => {}} />)
    await user.click(screen.getByRole('tab', { name: '回溯' }))
    const panel = screen.getByRole('tabpanel', { name: '回溯' })
    expect(within(panel).getByText('可用首发时间')).toBeVisible()
    expect(within(panel).getByText('0 / 12')).toBeVisible()
    expect(within(panel).getByText('稳定作者')).toBeVisible()
    expect(within(panel).getByText('0 / 3')).toBeVisible()
    expect(within(panel).getByText(/0 天（需至少 3 个 UTC 日历年）/)).toBeVisible()
    expect(within(panel).getByRole('link', { name: /查看原回答/ })).toHaveAttribute('href', unknown.url)
    expect(within(panel).queryByText(/答案纪年/)).not.toBeInTheDocument()
    expect(within(panel).queryByText(/分层|地层/)).not.toBeInTheDocument()
    for (const term of within(panel).getAllByRole('term')) {
      expect(term.parentElement?.querySelector('dd')).not.toBeNull()
    }
  })

  test('uses machine-readable dates and no time element for an unknown publication date', async () => {
    const user = userEvent.setup()
    const known = answer('answer:1', { bindings: [{ relation: 'created', folders: [] }], publishedAt: Date.parse('2024-06-02T00:00:00Z') / 1000 })
    const unknown = answer('answer:2', { bindings: [{ relation: 'created', folders: [] }] })
    render(<QuestionWorkspace index={index([known, unknown])} questionId={question.id} onBack={() => {}} onRestoreCamera={() => {}} />)
    expect(screen.getByText(/2024年6月2日/).closest('time')).toHaveAttribute('datetime', '2024-06-02')
    expect(screen.getByText('首发时间未知').tagName).toBe('SPAN')
    await user.click(screen.getByRole('tab', { name: '回溯' }))
    expect(screen.getByText('首发时间未知').tagName).toBe('SPAN')
  })

  test('displays publication dates in Asia/Shanghai', async () => {
    const user = userEvent.setup()
    const nearMidnight = answer('answer:timezone', { publishedAt: Date.UTC(2025, 11, 31, 16, 30) / 1000 })
    render(<QuestionWorkspace index={index([nearMidnight])} questionId={question.id} onBack={() => {}} onRestoreCamera={() => {}} />)
    await user.click(screen.getByRole('tab', { name: '回溯' }))
    expect(screen.getByText(/2026年1月1日/).closest('time')).toHaveAttribute('datetime', '2026-01-01')
  })

  test('paginates large original lists by 50 without dropping source access', async () => {
    const user = userEvent.setup()
    const answers = Array.from({ length: 120 }, (_, i) => answer(`answer:${i + 1}`, {
      bindings: [{ relation: 'created', folders: [] }],
    }))
    render(<QuestionWorkspace index={index(answers)} questionId={question.id} onBack={() => {}} onRestoreCamera={() => {}} />)
    expect(screen.getAllByRole('link', { name: /查看原回答/ })).toHaveLength(50)
    expect(screen.getByRole('status')).toHaveTextContent('已显示 50 / 120 条')
    await user.click(screen.getByRole('button', { name: '加载更多' }))
    expect(screen.getAllByRole('link', { name: /查看原回答/ })).toHaveLength(100)
    expect(screen.getByRole('status')).toHaveTextContent('已显示 100 / 120 条')
    await user.click(screen.getByRole('button', { name: '加载更多' }))
    expect(screen.getAllByRole('link', { name: /查看原回答/ })).toHaveLength(120)
    expect(screen.queryByRole('button', { name: '加载更多' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('已显示全部 120 条')
    expect(screen.getByRole('status')).toHaveFocus()
  })

  test('reacts to mobile media changes and cleans up the orientation listener', () => {
    let listener: ((event: MediaQueryListEvent) => void) | undefined
    const addEventListener = vi.fn((...args: Parameters<MediaQueryList['addEventListener']>) => {
      const next = args[1]
      if (typeof next === 'function') listener = next as (event: MediaQueryListEvent) => void
    })
    const media = {
      matches: true, media: '(max-width: 760px)', onchange: null,
      addEventListener,
      removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    } as MediaQueryList
    vi.stubGlobal('matchMedia', vi.fn(() => media))
    const view = render(<QuestionWorkspace index={index([])} questionId={question.id} onBack={() => {}} onRestoreCamera={() => {}} />)
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'horizontal')
    act(() => listener?.({ matches: false } as MediaQueryListEvent))
    expect(screen.getByRole('tablist')).toHaveAttribute('aria-orientation', 'vertical')
    view.unmount()
    expect(media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    vi.unstubAllGlobals()
  })

  test('shows an honest available retrospective and every original link', () => {
    const start = 1_600_000_000
    const answers = Array.from({ length: 12 }, (_, i) => answer(`answer:${i + 1}`, {
      authorId: `author:${i % 3}`, authorName: `作者 ${i % 3}`,
      publishedAt: start + i * (3 * 365 * day / 11),
    }))
    render(<QuestionWorkspace shared index={index(answers)} questionId={question.id} onBack={() => {}} onRestoreCamera={() => {}} />)
    expect(screen.getByRole('heading', { name: '答案纪年 · 当前样本回溯' })).toBeVisible()
    expect(screen.getByText(/当前仍可访问的答案按首发时间排列，不代表当年观点或社区份额/)).toBeVisible()
    expect(screen.getByText(/幸存者偏差/)).toBeVisible()
    expect(screen.getByText(/版本偏差/)).toBeVisible()
    expect(screen.getAllByRole('link', { name: /查看原回答/ })).toHaveLength(12)
    expect(screen.queryByText(/转折点|历史份额/)).not.toBeInTheDocument()
  })

  test('always exposes prism abstention without filling an AI stance', async () => {
    const user = userEvent.setup()
    render(<QuestionWorkspace index={index([])} questionId={question.id} onBack={() => {}} onRestoreCamera={() => {}} />)
    await user.click(screen.getByRole('tab', { name: '棱镜' }))
    expect(screen.getByText('证据不足，暂不生成观点结构')).toBeVisible()
    expect(screen.getByText(/不会为了视觉完整性填入 AI 推测的立场/)).toBeVisible()
  })

  test('Escape and Back close once, restore camera once and restore origin focus under StrictMode', async () => {
    const onBack = vi.fn()
    const onRestoreCamera = vi.fn()
    function Harness() {
      const [open, setOpen] = useState(true)
      const origin = useRef<HTMLButtonElement>(null)
      return <><button ref={origin}>来源按钮</button>{open && <QuestionWorkspace index={index([])} questionId={question.id}
        onBack={() => { onBack(); setOpen(false) }} onRestoreCamera={onRestoreCamera} getReturnFocus={() => origin.current} />}</>
    }
    const view = render(<StrictMode><Harness /></StrictMode>)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.getByRole('button', { name: '来源按钮' })).toHaveFocus())
    expect(onBack).toHaveBeenCalledOnce()
    expect(onRestoreCamera).toHaveBeenCalledOnce()
    view.unmount()

    onBack.mockClear(); onRestoreCamera.mockClear()
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: '返回问题航道' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '来源按钮' })).toHaveFocus())
    expect(onBack).toHaveBeenCalledOnce()
    expect(onRestoreCamera).toHaveBeenCalledOnce()
  })

  test('fallback keeps background inert and handles Escape exactly once', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, writable: true, value: undefined })
    const onBack = vi.fn()
    const onRestoreCamera = vi.fn()
    render(<><button>背景动作</button><QuestionWorkspace index={index([])} questionId={question.id} onBack={onBack} onRestoreCamera={onRestoreCamera} /></>)
    expect(screen.getByRole('button', { name: '背景动作' })).toHaveAttribute('inert')
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledOnce()
    expect(onRestoreCamera).toHaveBeenCalledOnce()
  })
})
