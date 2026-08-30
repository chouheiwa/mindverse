import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { ApiError } from '../apiCore'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { CurrentUniverse, SharePreview as Preview } from '../types'

const api = vi.hoisted(() => ({ previewShare: vi.fn(), createShare: vi.fn(), deleteShare: vi.fn() }))
vi.mock('../shareApi', () => api)
import { SharePreview } from './SharePreview'

const universe = {
  schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
  meta: { items: 2, concepts: 2, clusters: 1, own: 1, fav: 1, span: [1, 2] as [number, number], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [], particles: [], wormholes: [], solo: [], dark: [], nebula: [],
  stars: [
    { id: 'star:v1:private:8ed3f6ad685b959e', scope: 'private', externalQueryAllowed: false, questionIds: ['question:7'], probeIds: ['article:1'], c: 'Alpha', g: 0, p: [0, 0, 0] as [number, number, number], n: 1, o: 1, f: 0, hue: 1, sat: 1, pe: 1, bu: 0, fi: '', la: '', ev: [] },
    { id: 'star:v1:private:f44e64e75f3948e9', scope: 'private', externalQueryAllowed: false, questionIds: ['question:7', 'question:9'], probeIds: [], c: 'Beta', g: 0, p: [0, 0, 0] as [number, number, number], n: 1, o: 0, f: 1, hue: 1, sat: 1, pe: 1, bu: 0, fi: '', la: '', ev: [] },
  ],
  questions: [
    { id: 'question:7', questionId: '7', title: '问题七', url: 'https://www.zhihu.com/question/7', answerIds: ['answer:8'] },
    { id: 'question:9', questionId: '9', title: '问题九', url: 'https://www.zhihu.com/question/9', answerIds: [] },
  ],
  answers: [{ id: 'answer:8', questionId: 'question:7', title: '私密摘要不应用', url: 'https://www.zhihu.com/question/7/answer/8', observedAt: 99, bindings: [{ relation: 'created', folders: ['private'] }], discoverySources: ['own_content'] }],
  probes: [{ id: 'article:1', title: '私人文章', url: 'https://zhuanlan.zhihu.com/p/1', bindings: [], discoverySources: [] }],
} satisfies CurrentUniverse

const preview = (ids = ['question:7']): Preview => ({
  schemaVersion: 'share.v1', digest: 'd'.repeat(64),
  questions: ids.map((id) => ({ id, questionId: id.slice(9), title: id === 'question:7' ? '问题七' : '问题九', url: `https://www.zhihu.com/question/${id.slice(9)}`, answerIds: id === 'question:7' ? ['answer:8'] : [] })),
  answers: ids.includes('question:7') ? [{ id: 'answer:8', questionId: 'question:7', title: '公开回答', url: 'https://www.zhihu.com/question/7/answer/8' }] : [],
})

const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
})
afterEach(cleanup)

describe('SharePreview explicit consent', () => {
  test('starts empty, explains article scope, and disables creation', () => {
    render(<SharePreview universe={universe} onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: '选择分享' })).toBeVisible()
    expect(screen.getAllByRole('checkbox')).toHaveLength(2)
    expect(screen.getAllByRole('checkbox').every((box) => !(box as HTMLInputElement).checked)).toBe(true)
    expect(screen.getByRole('button', { name: '创建公开链接' })).toBeDisabled()
    expect(screen.getByText(/文章探测器.*不会.*公开/)).toBeVisible()
    expect(screen.getByText(/本页刷新后无法找回管理入口.*会话清除会级联撤销/)).toBeVisible()
    expect(api.previewShare).not.toHaveBeenCalled()
    expect(screen.getByTestId('share-public-preview')).not.toHaveAttribute('aria-live')
  })

  test('paginates a maximum-size candidate list and moves focus to the first revealed question', async () => {
    const questions = Array.from({ length: 1_000 }, (_, index) => {
      const questionId = String(index + 1)
      return { id: `question:${questionId}`, questionId, title: `问题 ${questionId}`, url: `https://www.zhihu.com/question/${questionId}`, answerIds: [] }
    })
    const large = {
      ...universe,
      questions,
      stars: [{ ...universe.stars![0], questionIds: questions.map(({ id }) => id) }],
    } satisfies CurrentUniverse
    const user = userEvent.setup()
    render(<SharePreview universe={large} onClose={() => {}} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(20)
    const more = screen.getByRole('button', { name: /再显示20个问题.*20\/1000/ })
    await user.click(more)
    expect(screen.getAllByRole('checkbox')).toHaveLength(40)
    expect(screen.getAllByRole('checkbox')[20]).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('已显示40个候选问题')
  })

  test('deduplicates questions, preserves local star context, and previews exact sorted IDs', async () => {
    api.previewShare.mockImplementation(async (ids: string[]) => preview(ids))
    const user = userEvent.setup()
    render(<SharePreview universe={universe} onClose={() => {}} />)
    expect(screen.getAllByText('问题七')).toHaveLength(1)
    expect(screen.getByText(/Alpha.*Beta/)).toBeVisible()
    await user.click(screen.getByRole('checkbox', { name: /问题九/ }))
    await user.click(screen.getByRole('checkbox', { name: /问题七/ }))
    await waitFor(() => expect(api.previewShare).toHaveBeenLastCalledWith(['question:7', 'question:9'], expect.any(AbortSignal)))
    expect(await screen.findByRole('heading', { name: '公开预览' })).toBeVisible()
    const publicPreview = screen.getByTestId('share-public-preview')
    expect(within(publicPreview).getByText('公开回答')).toBeVisible()
    expect(within(publicPreview).queryByText(/Alpha|Beta|私人文章|private|收藏|创作/)).not.toBeInTheDocument()
  })

  test('renders only the latest preview response and invalidates an old digest immediately', async () => {
    const first = deferred<Preview>()
    const second = deferred<Preview>()
    api.previewShare.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const user = userEvent.setup()
    render(<SharePreview universe={universe} onClose={() => {}} />)
    await user.click(screen.getByRole('checkbox', { name: /问题七/ }))
    await user.click(screen.getByRole('checkbox', { name: /问题九/ }))
    expect(screen.getByRole('button', { name: '创建公开链接' })).toBeDisabled()
    first.resolve(preview(['question:7']))
    await Promise.resolve()
    expect(screen.queryByText('公开回答')).not.toBeInTheDocument()
    second.resolve(preview(['question:7', 'question:9']))
    await waitFor(() => expect(screen.getByRole('button', { name: '创建公开链接' })).toBeEnabled())
  })

  test('creates with the exact current digest, then can revoke the owner link', async () => {
    api.previewShare.mockResolvedValue(preview())
    api.createShare.mockResolvedValue({ id: 'share_1', url: '/s/share_1', expiresAt: '2026-09-07T00:00:00Z' })
    api.deleteShare.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<SharePreview universe={universe} onClose={() => {}} />)
    await user.click(screen.getByRole('checkbox', { name: /问题七/ }))
    await user.click(await screen.findByRole('button', { name: '创建公开链接' }))
    expect(api.createShare).toHaveBeenCalledWith(['question:7'], 'd'.repeat(64))
    expect(await screen.findByRole('link', { name: '打开公开页' })).toHaveAttribute('href', '/s/share_1')
    expect(screen.getByText(/2026/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: '撤销这个链接' }))
    expect(api.deleteShare).toHaveBeenCalledWith('share_1')
    expect(await screen.findByText('链接已撤销')).toBeVisible()
  })

  test('requires a fresh preview after create conflict', async () => {
    api.previewShare.mockResolvedValue(preview())
    api.createShare.mockRejectedValue(new ApiError(409, '分享预览已过期，请重新预览'))
    const user = userEvent.setup()
    render(<SharePreview universe={universe} onClose={() => {}} />)
    await user.click(screen.getByRole('checkbox', { name: /问题七/ }))
    await user.click(await screen.findByRole('button', { name: '创建公开链接' }))
    expect(await screen.findByRole('button', { name: '重新预览' })).toBeVisible()
    expect(screen.getByRole('button', { name: '创建公开链接' })).toBeDisabled()
  })

  test('locks selection and close while creation is pending', async () => {
    api.previewShare.mockResolvedValue(preview())
    const pendingCreate = deferred<{ id: string; url: string; expiresAt: string }>()
    api.createShare.mockReturnValue(pendingCreate.promise)
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<SharePreview universe={universe} onClose={onClose} />)
    await user.click(screen.getByRole('checkbox', { name: /问题七/ }))
    await user.click(await screen.findByRole('button', { name: '创建公开链接' }))
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).disabled)).toBe(true)
    expect(screen.getByRole('button', { name: '关闭分享选择' })).toBeDisabled()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).not.toHaveBeenCalled()
    pendingCreate.resolve({ id: 'share_1', url: '/s/share_1', expiresAt: '2026-09-07T00:00:00Z' })
    expect(await screen.findByRole('link', { name: '打开公开页' })).toBeVisible()
    expect(screen.getAllByRole('checkbox').every((box) => (box as HTMLInputElement).disabled)).toBe(true)
  })

  test('preserves a created owner link while the persistent dialog closes and reopens', async () => {
    api.previewShare.mockResolvedValue(preview())
    api.createShare.mockResolvedValue({ id: 'share_1', url: '/s/share_1', expiresAt: '2026-09-07T00:00:00Z' })
    const user = userEvent.setup()
    function Harness() {
      const [open, setOpen] = useState(true)
      return <><button onClick={() => setOpen(true)}>再次打开</button><SharePreview open={open} universe={universe} onClose={() => setOpen(false)} /></>
    }
    render(<Harness />)
    await user.click(screen.getByRole('checkbox', { name: /问题七/ }))
    await user.click(await screen.findByRole('button', { name: '创建公开链接' }))
    await user.click(await screen.findByRole('button', { name: '关闭分享选择' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '再次打开' }))
    expect(await screen.findByRole('link', { name: '打开公开页' })).toHaveAttribute('href', '/s/share_1')
    expect(api.createShare).toHaveBeenCalledTimes(1)
  })

  test('keeps the link on revoke failure, prevents double submit, then revokes and allows recreation', async () => {
    api.previewShare.mockResolvedValue(preview())
    api.createShare.mockResolvedValue({ id: 'share_1', url: '/s/share_1', expiresAt: '2026-09-07T00:00:00Z' })
    const revoke = deferred<{ ok: true }>()
    api.deleteShare.mockReturnValueOnce(revoke.promise).mockResolvedValueOnce({ ok: true })
    const user = userEvent.setup()
    render(<SharePreview universe={universe} onClose={() => {}} />)
    await user.click(screen.getByRole('checkbox', { name: /问题七/ }))
    await user.click(await screen.findByRole('button', { name: '创建公开链接' }))
    const revokeButton = await screen.findByRole('button', { name: '撤销这个链接' })
    await user.click(revokeButton)
    expect(revokeButton).toBeDisabled()
    await user.click(revokeButton)
    expect(api.deleteShare).toHaveBeenCalledTimes(1)
    revoke.reject(new Error('撤销失败'))
    expect(await screen.findByRole('alert')).toHaveTextContent('撤销失败')
    expect(screen.getByRole('link', { name: '打开公开页' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '重试撤销' }))
    expect(await screen.findByText('链接已撤销')).toBeVisible()
    expect(screen.getAllByRole('checkbox').every((box) => !(box as HTMLInputElement).disabled)).toBe(true)
    expect(screen.getByRole('button', { name: '创建公开链接' })).toBeEnabled()
  })

  test('reports clipboard success and fallback failure', async () => {
    api.previewShare.mockResolvedValue(preview())
    api.createShare.mockResolvedValue({ id: 'share_1', url: '/s/share_1', expiresAt: '2026-09-07T00:00:00Z' })
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<SharePreview universe={universe} onClose={() => {}} />)
    await user.click(screen.getByRole('checkbox', { name: /问题七/ }))
    await user.click(await screen.findByRole('button', { name: '创建公开链接' }))
    await user.click(screen.getByRole('button', { name: '复制链接' }))
    expect(await screen.findByText('链接已复制')).toBeVisible()
    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/\/s\/share_1$/))

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) })
    await user.click(screen.getByRole('button', { name: '复制链接' }))
    expect(await screen.findByText('复制失败，请手动打开后复制')).toBeVisible()
  })

  test('closes with Escape/cancel and restores focus to the opener', async () => {
    const onClose = vi.fn()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(<SharePreview universe={universe} onClose={onClose} getReturnFocus={() => opener} />)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalled()
    unmount()
    await waitFor(() => expect(opener).toHaveFocus())
    opener.remove()
  })
})
