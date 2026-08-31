import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { ArticleProbe } from '../types'
import { ProbeInspectionPanel } from './ProbeInspectionPanel'

const probe: ArticleProbe = {
  id: 'article:21', title: '真实文章标题', url: 'https://zhuanlan.zhihu.com/p/21',
  authorName: 'Alice', bindings: [], discoverySources: ['public_search'],
}

afterEach(() => {
  cleanup()
  document.querySelectorAll('canvas').forEach((canvas) => canvas.remove())
  document.querySelectorAll('[data-probe-test-background]').forEach((element) => element.remove())
})

function setup(scanComplete = false) {
  const background = document.createElement('button')
  background.dataset.probeTestBackground = 'true'
  background.textContent = '背景操作'
  document.body.append(background)
  const canvas = document.createElement('canvas')
  canvas.tabIndex = 0
  document.body.append(canvas)
  const onPoseChange = vi.fn()
  const onPartChange = vi.fn()
  const onScan = vi.fn()
  const onClose = vi.fn()
  const view = render(<ProbeInspectionPanel probe={probe} canvas={canvas}
    scanning={false} scanComplete={scanComplete} scanError={null} selectedPart={null}
    onPoseChange={onPoseChange} onPartChange={onPartChange}
    onScan={onScan} onClose={onClose} />)
  return { background, canvas, onPoseChange, onPartChange, onScan, onClose, ...view }
}

describe('ProbeInspectionPanel', () => {
  test('focuses its title and exposes controls without making Three objects tabbable', () => {
    const { canvas } = setup()
    const dialog = screen.getByRole('dialog', { name: '检查探测器：真实文章标题' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: '检查探测器：真实文章标题' })).toHaveFocus()
    expect(screen.getByRole('group', { name: '探测器视角控制' })).toBeVisible()
    for (const name of ['向左旋转', '向右旋转', '向上旋转', '向下旋转', '放大', '缩小', '向左平移', '向右平移', '归位', '开始扫描']) {
      expect(screen.getByRole('button', { name })).toBeVisible()
    }
    expect(canvas).toHaveAttribute('tabindex', '-1')
  })

  test('traps forward and reverse Tab while isolating and restoring background controls', async () => {
    const user = userEvent.setup()
    const { background, canvas, unmount } = setup(true)
    const close = screen.getByRole('button', { name: '关闭探测器检查' })
    const link = screen.getByRole('link', { name: '查看原文章' })
    expect(background).toHaveAttribute('inert')
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
    expect(canvas).toHaveAttribute('tabindex', '-1')

    await user.tab()
    expect(close).toHaveFocus()
    await user.tab({ shift: true })
    expect(link).toHaveFocus()
    await user.tab()
    expect(close).toHaveFocus()

    unmount()
    expect(background).not.toHaveAttribute('inert')
    expect(background).not.toHaveAttribute('aria-hidden')
    expect(canvas).not.toHaveAttribute('aria-hidden')
    expect(canvas).toHaveAttribute('tabindex', '0')
  })

  test('routes buttons, keyboard, primary drag, right drag and pinch through one controller', async () => {
    const user = userEvent.setup()
    const { canvas, onPoseChange } = setup()
    await user.click(screen.getByRole('button', { name: '向左旋转' }))
    screen.getByRole('heading', { name: '检查探测器：真实文章标题' }).focus()
    await user.keyboard('{ArrowRight}+')
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10, button: 0 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 30, clientY: 18, button: 0 })
    fireEvent.pointerUp(canvas, { pointerId: 1 })
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 30, clientY: 30, button: 2 })
    fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 45, clientY: 45, button: 2 })
    fireEvent.pointerUp(canvas, { pointerId: 2 })
    fireEvent.pointerDown(canvas, { pointerId: 3, clientX: 20, clientY: 20, button: 0 })
    fireEvent.pointerDown(canvas, { pointerId: 4, clientX: 60, clientY: 20, button: 0 })
    fireEvent.pointerMove(canvas, { pointerId: 4, clientX: 80, clientY: 25, button: 0 })
    expect(onPoseChange.mock.calls.length).toBeGreaterThanOrEqual(5)
    expect(onPoseChange.mock.calls.every(([pose]) => Number.isFinite(pose.yaw) && Number.isFinite(pose.distance))).toBe(true)
  })

  test('synchronizes DOM part controls and renderer-selected parts', async () => {
    const user = userEvent.setup()
    const { onPartChange, rerender, canvas } = setup()
    const antenna = screen.getByRole('button', { name: '聚焦部件：天线' })
    await user.click(antenna)
    expect(onPartChange).toHaveBeenLastCalledWith('antenna')
    rerender(<ProbeInspectionPanel probe={probe} canvas={canvas} scanning={false}
      scanComplete={false} scanError={null} selectedPart="scanner-lens" onPoseChange={() => {}}
      onPartChange={onPartChange} onScan={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: '聚焦部件：扫描镜头' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('opens only the inspected article after scan completes and announces status politely', async () => {
    const user = userEvent.setup()
    const { onScan, rerender, canvas } = setup(false)
    expect(screen.queryByRole('link', { name: '查看原文章' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    const scan = screen.getByRole('button', { name: '开始扫描' })
    await user.click(scan)
    expect(onScan).toHaveBeenCalledOnce()
    rerender(<ProbeInspectionPanel probe={probe} canvas={canvas} scanning
      scanComplete={false} scanError={null} selectedPart={null} onPoseChange={() => {}} onPartChange={() => {}}
      onScan={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: '检查探测器：真实文章标题' })).toHaveFocus()
    rerender(<ProbeInspectionPanel probe={probe} canvas={canvas} scanning={false}
      scanComplete scanError={null} selectedPart={null} onPoseChange={() => {}} onPartChange={() => {}}
      onScan={() => {}} onClose={() => {}} />)
    const link = screen.getByRole('link', { name: '查看原文章' })
    expect(link).toHaveAttribute('href', probe.url)
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test('announces a safe scan failure, keeps the current article link, and does not hijack link or background keys', () => {
    const { background, canvas, onPoseChange, rerender } = setup(true)
    rerender(<ProbeInspectionPanel probe={probe} canvas={canvas} scanning={false}
      scanComplete scanError="扫描失败，请重试。" selectedPart={null} onPoseChange={onPoseChange}
      onPartChange={() => {}} onScan={() => {}} onClose={() => {}} />)
    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveTextContent('扫描失败，请重试。')
    const link = screen.getByRole('link', { name: '查看原文章' })
    expect(link).toHaveAttribute('href', probe.url)
    const before = onPoseChange.mock.calls.length
    fireEvent.keyDown(link, { key: 'ArrowRight' })
    fireEvent.keyDown(background, { key: '+' })
    expect(onPoseChange).toHaveBeenCalledTimes(before)
  })

  test('does not install global keyboard handlers when StrictMode remounts effects', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const canvas = document.createElement('canvas')
    document.body.append(canvas)
    const onPoseChange = vi.fn()
    render(<StrictMode><ProbeInspectionPanel probe={probe} canvas={canvas} scanning={false}
      scanComplete={false} scanError={null} selectedPart={null} onPoseChange={onPoseChange}
      onPartChange={() => {}} onScan={() => {}} onClose={() => {}} /></StrictMode>)
    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(0)
    const before = onPoseChange.mock.calls.length
    fireEvent.keyDown(screen.getByRole('heading', { name: '检查探测器：真实文章标题' }), { key: 'ArrowRight' })
    expect(onPoseChange).toHaveBeenCalledTimes(before + 1)
  })

  test('closes with Escape so the owner can restore the original trigger', async () => {
    const user = userEvent.setup()
    const { onClose } = setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })
})
