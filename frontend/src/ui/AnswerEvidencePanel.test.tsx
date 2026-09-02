import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { AnswerSatellite } from '../types'
import { AnswerEvidencePanel } from './AnswerEvidencePanel'

const answer: AnswerSatellite = {
  id: 'answer:42',
  questionId: 'question:7',
  title: '回答标题',
  summary: '这是当前可访问版本的一行摘要。',
  url: 'https://www.zhihu.com/question/7/answer/42',
  authorId: 'author:1',
  authorName: 'Alice',
  publishedAt: Date.parse('2022-04-03T08:00:00Z') / 1000,
  observedAt: Date.parse('2026-08-31T03:00:00Z') / 1000,
  bindings: [{ relation: 'collected', folders: ['稍后阅读'] }],
  discoverySources: [],
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})
afterEach(cleanup)

describe('AnswerEvidencePanel', () => {
  test('shows separate evidence times, exact source, and no inferred stance', () => {
    render(<AnswerEvidencePanel answer={answer} onClose={() => {}} />)

    expect(screen.getByText('首发时间').nextElementSibling).toHaveTextContent('2022')
    expect(screen.getByText('更新时间').nextElementSibling).toHaveTextContent('未知')
    expect(screen.getByText('观测时间').nextElementSibling).toHaveTextContent('2026')
    expect(screen.getByRole('link', { name: '打开知乎原回答' })).toHaveAttribute('href', answer.url)
    expect(screen.getByText(answer.summary!)).toBeVisible()
    expect(screen.getByText(/收藏只表示保存关系/)).toBeVisible()
    expect(screen.queryByText(/认同|反对|立场/)).not.toBeInTheDocument()
  })

  test('closes with Escape and restores focus to the originating HUD control', async () => {
    const onClose = vi.fn()
    const origin = document.createElement('button')
    origin.textContent = '标本代理按钮'
    document.body.append(origin)
    const view = render(<AnswerEvidencePanel answer={answer} onClose={onClose} getReturnFocus={() => origin} />)

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    view.unmount()
    await waitFor(() => expect(origin).toHaveFocus())
    origin.remove()
  })
})
