import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { PlanetDatum } from '../starmap/gl/bodies'
import { QuestionEntryShell } from './QuestionEntryShell'

afterEach(cleanup)

const planet = {
  question: { id: 'question:7', questionId: '7', title: '真实问题标题', url: 'https://www.zhihu.com/question/7', answerIds: ['answer:8'] },
  answers: [{
    id: 'answer:8', questionId: 'question:7', title: '真实问题标题', summary: '回答摘要',
    url: 'https://www.zhihu.com/question/7/answer/8', authorName: 'Alice', publishedAt: 1_700_000_000,
    updatedAt: 1_700_086_400, likeCount: 12, commentCount: 3, bindings: [], discoverySources: ['public_search'],
  }],
  answerCount: 1, created: false, collected: false, latestPublicAt: 1_700_086_400,
  star: {} as PlanetDatum['star'], index: 0, orbitIndex: 1, u: [1, 0, 0], v: [0, 1, 0], orbitR: 2.1, phase: 0, period: 10, radius: .1,
} satisfies PlanetDatum

describe('QuestionEntryShell', () => {
  test('is a real question destination with referenced answer evidence and honest availability', () => {
    render(<QuestionEntryShell planet={planet} onBack={() => {}} />)
    expect(screen.getByRole('heading', { name: '真实问题标题' })).toBeVisible()
    expect(screen.getByText(/1 个已收录回答卫星/)).toBeVisible()
    expect(screen.getByRole('link', { name: '知乎原问题' })).toHaveAttribute('href', planet.question.url)
    expect(screen.getByRole('link', { name: /Alice/ })).toHaveAttribute('href', planet.answers[0].url)
    expect(screen.getByText(/回答摘要/)).toBeVisible()
    expect(screen.getByText(/12 赞同 · 3 评论/)).toBeVisible()
    expect(screen.getByText(/深度观察模式尚未生成/)).toBeVisible()
  })

  test('supports Back and Escape and focuses the shell heading on entry', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    render(<QuestionEntryShell planet={planet} onBack={onBack} />)
    expect(screen.getByRole('heading', { name: '真实问题标题' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onBack).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '返回问题航道' }))
    expect(onBack).toHaveBeenCalledTimes(2)
  })

  test('removes its Escape listener when the destination is left', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    const view = render(<QuestionEntryShell planet={planet} onBack={onBack} />)
    view.unmount()
    await user.keyboard('{Escape}')
    expect(onBack).not.toHaveBeenCalled()
  })
})
