import { useRef } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useModalDialogLifecycle } from './modalDialogLifecycle'

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, writable: true, value: undefined })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})
afterEach(cleanup)

test('fallback dialog with no focusable children contains Tab on the dialog itself', () => {
  function EmptyDialog() {
    const ref = useRef<HTMLDialogElement>(null)
    const lifecycle = useModalDialogLifecycle(ref)
    return <dialog ref={ref} aria-label="空模态" onKeyDown={lifecycle.onKeyDown}><p>没有控件</p></dialog>
  }
  render(<><button>背景</button><EmptyDialog /></>)
  const dialog = screen.getByRole('dialog', { name: '空模态' })
  expect(dialog).toHaveFocus()
  fireEvent.keyDown(dialog, { key: 'Tab' })
  expect(dialog).toHaveFocus()
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
  expect(dialog).toHaveFocus()
  expect(screen.getByRole('button', { name: '背景' })).toHaveAttribute('inert')
})
