import { StrictMode, useRef, useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Universe } from '../types'
import type { UniverseIndex } from '../domain/universe'
import { QuestionWorkspaceGate } from './QuestionWorkspaceGate'
import type { QuestionWorkspaceLoader } from './questionWorkspaceLoader'

const index = { universe: {} as Universe, starsById: new Map(), questionsById: new Map(), answersById: new Map(), probesById: new Map() } satisfies UniverseIndex
const props = { index, questionId: 'question:7', onBack: vi.fn(), onRestoreCamera: vi.fn() }

beforeEach(() => {
  props.onBack.mockClear(); props.onRestoreCamera.mockClear()
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, writable: true, value: undefined })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})
afterEach(cleanup)

describe('QuestionWorkspaceGate', () => {
  test('shows a synchronous native-modal loading fallback, inerts background, and supports Back', async () => {
    const loader: QuestionWorkspaceLoader = () => new Promise(() => {})
    render(<><button>背景动作</button><QuestionWorkspaceGate {...props} loader={loader} /></>)
    expect(screen.getByRole('dialog', { name: '正在建立问题工作台' })).toBeInstanceOf(HTMLDialogElement)
    expect(screen.getByRole('status')).toHaveTextContent('正在建立问题航道')
    expect(screen.getByRole('button', { name: '背景动作' })).toHaveAttribute('inert')
    await userEvent.click(screen.getByRole('button', { name: '返回宇宙' }))
    expect(props.onRestoreCamera).toHaveBeenCalledOnce()
    expect(props.onBack).toHaveBeenCalledOnce()
  })

  test('contains rejected imports in an accessible error modal and can retry', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    let loads = 0
    const loader: QuestionWorkspaceLoader = () => {
      loads += 1
      return loads === 1
        ? Promise.reject(new Error('chunk offline'))
        : Promise.resolve({ default: () => <div role="dialog" aria-label="已恢复工作台">恢复成功</div> })
    }
    render(<QuestionWorkspaceGate {...props} loader={loader} />)
    expect(await screen.findByRole('dialog', { name: '问题工作台加载失败' })).toBeVisible()
    expect(screen.getByText(/未能加载问题工作台/)).toBeVisible()
    expect(screen.getByRole('button', { name: '返回宇宙' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(await screen.findByRole('dialog', { name: '已恢复工作台' })).toBeVisible()
    expect(loads).toBe(2)
    error.mockRestore()
  })

  test('error cancel returns and restores exactly once', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const loader: QuestionWorkspaceLoader = () => Promise.reject(new Error('offline'))
    render(<QuestionWorkspaceGate {...props} loader={loader} />)
    await screen.findByRole('dialog', { name: '问题工作台加载失败' })
    await userEvent.click(screen.getByRole('button', { name: '返回宇宙' }))
    expect(props.onRestoreCamera).toHaveBeenCalledOnce()
    expect(props.onBack).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  test.each(['Back', 'Escape'] as const)('loading %s exits once and restores originating focus after unmount in StrictMode', async (action) => {
    const loader: QuestionWorkspaceLoader = () => new Promise(() => {})
    function Harness() {
      const [open, setOpen] = useState(true)
      const origin = useRef<HTMLButtonElement>(null)
      return <><button ref={origin}>加载来源</button>{open && <QuestionWorkspaceGate {...props} loader={loader}
        getReturnFocus={() => origin.current} onBack={() => { props.onBack(); setOpen(false) }} />}</>
    }
    render(<StrictMode><Harness /></StrictMode>)
    const dialog = screen.getByRole('dialog', { name: '正在建立问题工作台' })
    if (action === 'Back') await userEvent.click(screen.getByRole('button', { name: '返回宇宙' }))
    else {
      fireEvent.keyDown(dialog, { key: 'Escape' })
      fireEvent.keyDown(dialog, { key: 'Escape' })
    }
    const origin = screen.getByRole('button', { name: '加载来源' })
    await waitFor(() => expect(origin).toHaveFocus())
    expect(origin).not.toHaveAttribute('inert')
    expect(props.onRestoreCamera).toHaveBeenCalledOnce()
    expect(props.onBack).toHaveBeenCalledOnce()
  })

  test('error Back restores originating focus after the error dialog unmounts', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const loader: QuestionWorkspaceLoader = () => Promise.reject(new Error('offline'))
    function Harness() {
      const [open, setOpen] = useState(true)
      const origin = useRef<HTMLButtonElement>(null)
      return <><button ref={origin}>错误来源</button>{open && <QuestionWorkspaceGate {...props} loader={loader}
        getReturnFocus={() => origin.current} onBack={() => { props.onBack(); setOpen(false) }} />}</>
    }
    render(<Harness />)
    await screen.findByRole('dialog', { name: '问题工作台加载失败' })
    await userEvent.click(screen.getByRole('button', { name: '返回宇宙' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '错误来源' })).toHaveFocus())
    expect(props.onRestoreCamera).toHaveBeenCalledOnce()
    expect(props.onBack).toHaveBeenCalledOnce()
    error.mockRestore()
  })

  test('fallback loading dialog contains Tab and Shift+Tab without reaching inert background', () => {
    const loader: QuestionWorkspaceLoader = () => new Promise(() => {})
    render(<><button>背景动作</button><QuestionWorkspaceGate {...props} loader={loader} /></>)
    const dialog = screen.getByRole('dialog', { name: '正在建立问题工作台' })
    const back = screen.getByRole('button', { name: '返回宇宙' })
    expect(back).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(back).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(back).toHaveFocus()
    expect(screen.getByRole('button', { name: '背景动作' })).not.toHaveFocus()
  })

  test('fallback error dialog wraps focus between both controls', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const loader: QuestionWorkspaceLoader = () => Promise.reject(new Error('offline'))
    render(<><button>背景动作</button><QuestionWorkspaceGate {...props} loader={loader} /></>)
    const dialog = await screen.findByRole('dialog', { name: '问题工作台加载失败' })
    const back = screen.getByRole('button', { name: '返回宇宙' })
    const retry = screen.getByRole('button', { name: '重新加载' })
    expect(back).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
    expect(retry).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Tab' })
    expect(back).toHaveFocus()
    expect(screen.getByRole('button', { name: '背景动作' })).not.toHaveFocus()
    error.mockRestore()
  })
})
