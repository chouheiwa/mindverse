import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { StrictMode, useRef, useState } from 'react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { PlanetDatum } from '../starmap/gl/bodies'
import { QuestionEntryShell } from './QuestionEntryShell'

afterEach(cleanup)
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

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
    expect(screen.getByRole('dialog')).toBeInstanceOf(HTMLDialogElement)
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledOnce()
    expect(screen.getByRole('heading', { name: '真实问题标题' })).toBeVisible()
    expect(screen.getByText(/1 个已收录回答卫星/)).toBeVisible()
    expect(screen.getByRole('link', { name: '知乎原问题' })).toHaveAttribute('href', planet.question.url)
    expect(screen.getByRole('link', { name: /Alice/ })).toHaveAttribute('href', planet.answers[0].url)
    expect(screen.getByText(/回答摘要/)).toBeVisible()
    expect(screen.getByText(/12 赞同 · 3 评论/)).toBeVisible()
    expect(screen.getByText(/深度观察模式尚未生成/)).toBeVisible()
  })

  test('renders an unknown public time for an invalid epoch instead of throwing', () => {
    const unsafe = { ...planet, answers: [{ ...planet.answers[0], updatedAt: Number.MAX_SAFE_INTEGER }] }
    expect(() => render(<QuestionEntryShell planet={unsafe} onBack={() => {}} />)).not.toThrow()
    expect(screen.getByText('公开时间未知')).toBeVisible()
  })

  test('traps Tab inside the native modal while it is open', async () => {
    const user = userEvent.setup()
    render(<><QuestionEntryShell planet={planet} onBack={() => {}} /><button>背景动作</button></>)
    const dialog = screen.getByRole('dialog')
    for (let index = 0; index < 8; index += 1) {
      await user.tab()
      expect(dialog).toContainElement(document.activeElement as HTMLElement)
      expect(screen.getByRole('button', { name: '背景动作' })).not.toHaveFocus()
    }
  })

  test('supports native cancel and Back and restores its originating focus', async () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      const trigger = useRef<HTMLButtonElement>(null)
      return <>
        <button ref={trigger} onClick={() => setOpen(true)}>打开问题</button>
        {open && <QuestionEntryShell planet={planet} onBack={() => setOpen(false)} getReturnFocus={() => trigger.current} />}
      </>
    }
    const onBack = vi.fn()
    const user = userEvent.setup()
    const direct = render(<QuestionEntryShell planet={planet} onBack={onBack} />)
    expect(screen.getByRole('heading', { name: '真实问题标题' })).toHaveFocus()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onBack).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '返回问题航道' }))
    expect(onBack).toHaveBeenCalledTimes(2)
    direct.unmount()

    render(<Harness />)
    const trigger = screen.getByRole('button', { name: '打开问题' })
    await user.click(trigger)
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(trigger).toHaveFocus())
    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: '返回问题航道' }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  test('does not react to Escape after the destination is left', async () => {
    const onBack = vi.fn()
    const user = userEvent.setup()
    const view = render(<QuestionEntryShell planet={planet} onBack={onBack} />)
    view.unmount()
    await user.keyboard('{Escape}')
    expect(onBack).not.toHaveBeenCalled()
  })

  test('StrictMode cleanup close events never tear down a reopened destination', async () => {
    const onBack = vi.fn()
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute('open')
      queueMicrotask(() => this.dispatchEvent(new Event('close')))
    })
    render(<StrictMode><QuestionEntryShell planet={planet} onBack={onBack} /></StrictMode>)
    await waitFor(() => expect(screen.getByRole('dialog')).toBeVisible())
    await Promise.resolve()
    expect(onBack).not.toHaveBeenCalled()
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  test('fallback marks the shell modal, inerts background siblings, and restores them', async () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, writable: true, value: undefined })
    function Harness() {
      const [open, setOpen] = useState(true)
      return <><button>背景动作</button>{open && <QuestionEntryShell planet={planet} onBack={() => setOpen(false)} />}</>
    }
    const view = render(<Harness />)
    const background = screen.getByRole('button', { name: '背景动作' })
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(background).toHaveAttribute('inert')
    await userEvent.click(screen.getByRole('button', { name: '返回问题航道' }))
    expect(background).not.toHaveAttribute('inert')
    view.unmount()
  })
})
