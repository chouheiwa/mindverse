import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ShareView } from '../types'

const api = vi.hoisted(() => ({ getShare: vi.fn() }))
vi.mock('../shareApi', () => api)
import { SharedView } from './SharedView'
import { PublicShareContent } from './PublicShareContent'

const view: ShareView = {
  schemaVersion: 'share.v1',
  questions: [{ id: 'question:7', questionId: '7', title: '真实问题', url: 'https://www.zhihu.com/question/7', answerIds: ['answer:8'] }],
  answers: [{ id: 'answer:8', questionId: 'question:7', title: '公开回答', url: 'https://www.zhihu.com/question/7/answer/8', authorId: 'author:alice', authorName: 'Alice', publishedAt: 1_767_225_600, likeCount: 3, commentCount: 2, favoriteCount: 1 }],
}

beforeEach(() => vi.clearAllMocks())
afterEach(cleanup)

describe('read-only public ShareView', () => {
  test('renders selected public questions and answers with evidence links and disclaimer', async () => {
    api.getShare.mockResolvedValue(view)
    render(<SharedView shareId="public_1" />)
    expect(await screen.findByRole('heading', { name: '真实问题' })).toBeVisible()
    expect(screen.getByText(/分享者逐项选择.*不代表完整个人宇宙/)).toBeVisible()
    expect(screen.getByRole('link', { name: '查看问题原页' })).toHaveAttribute('href', 'https://www.zhihu.com/question/7')
    const answer = screen.getByRole('article', { name: '公开回答' })
    expect(within(answer).getByText('Alice')).toBeVisible()
    expect(within(answer).getByText(/3 赞同/)).toBeVisible()
    expect(within(answer).getByText(/2026/)).toBeVisible()
    expect(screen.queryByText(/恒星|个人关系|已收藏|我创作|纪年|棱镜/)).not.toBeInTheDocument()
  })

  test('renders an honest empty and legacy state', async () => {
    api.getShare.mockResolvedValueOnce({ schemaVersion: 'share.v1', questions: [], answers: [] })
    const { rerender } = render(<SharedView shareId="empty" />)
    expect(await screen.findByText('这个公开视图没有问题')).toBeVisible()
    api.getShare.mockResolvedValueOnce({ schemaVersion: 'share.v1', legacy: true, questions: [], answers: [] })
    rerender(<SharedView shareId="legacy" />)
    expect(await screen.findByText('这是旧版分享，不再展示历史私有快照')).toBeVisible()
  })

  test('shows not-found/error state and retries', async () => {
    api.getShare.mockRejectedValueOnce(new Error('分享不存在或已过期')).mockResolvedValueOnce(view)
    const user = userEvent.setup()
    render(<SharedView shareId="missing" />)
    expect(await screen.findByText('分享不存在或已过期')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByRole('heading', { name: '真实问题' })).toBeVisible()
    expect(api.getShare).toHaveBeenCalledTimes(2)
  })

  test('aborts an obsolete request when the route changes', async () => {
    api.getShare.mockImplementation((_id: string, signal: AbortSignal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    const { rerender } = render(<SharedView shareId="first" />)
    rerender(<SharedView shareId="second" />)
    await waitFor(() => expect(api.getShare.mock.calls[0][1].aborted).toBe(true))
  })

  test('bounds a maximum legal view and incrementally reveals questions and answers with focus continuity', async () => {
    const questionIds = Array.from({ length: 1_000 }, (_, index) => String(index + 1))
      .sort((left, right) => `question:${left}`.localeCompare(`question:${right}`))
    const answerNumbers = Array.from({ length: 10_000 }, (_, index) => String(index + 1))
      .sort((left, right) => `answer:${left}`.localeCompare(`answer:${right}`))
    const large: ShareView = {
      schemaVersion: 'share.v1',
      questions: questionIds.map((questionId, index) => ({
        id: `question:${questionId}`, questionId, title: `Q ${index + 1}`,
        url: `https://www.zhihu.com/question/${questionId}`,
        answerIds: index === 0 ? answerNumbers.map((id) => `answer:${id}`) : [],
      })),
      answers: answerNumbers.map((id) => ({
        id: `answer:${id}`, questionId: `question:${questionIds[0]}`, title: `A ${id}`,
        url: `https://www.zhihu.com/question/${questionIds[0]}/answer/${id}`,
      })),
    }
    const user = userEvent.setup()
    render(<PublicShareContent view={large} />)
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(20)
    expect(screen.getAllByRole('article')).toHaveLength(50)
    const moreAnswers = screen.getByRole('button', { name: /再显示50个答案.*50\/10000/ })
    await user.click(moreAnswers)
    expect(screen.getAllByRole('article')).toHaveLength(100)
    expect(screen.getAllByRole('article')[50]).toHaveFocus()
    const moreQuestions = screen.getByRole('button', { name: /再显示20个问题.*20\/1000/ })
    await user.click(moreQuestions)
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(40)
    expect(screen.getAllByRole('heading', { level: 2 })[20]).toHaveFocus()
    expect(screen.getAllByRole('status').some((node) => node.textContent === '已显示40个问题')).toBe(true)
  })

  test('resets pagination when the public view changes', async () => {
    const many: ShareView = {
      schemaVersion: 'share.v1', answers: [],
      questions: Array.from({ length: 25 }, (_, index) => ({
        id: `question:${index + 1}`, questionId: String(index + 1), title: `Old ${index + 1}`,
        url: `https://www.zhihu.com/question/${index + 1}`, answerIds: [],
      })),
    }
    const user = userEvent.setup()
    const { rerender } = render(<PublicShareContent view={many} />)
    await user.click(screen.getByRole('button', { name: /再显示/ }))
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(25)
    rerender(<PublicShareContent view={{ ...many, questions: many.questions.map((question) => ({ ...question, title: `New ${question.questionId}` })) }} />)
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(20)
    expect(screen.queryByText('Old 1')).not.toBeInTheDocument()
  })
})
