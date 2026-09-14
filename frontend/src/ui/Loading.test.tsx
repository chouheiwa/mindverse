import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { Loading } from './Loading'

afterEach(cleanup)

describe('universe formation', () => {
  test('follows real stages and keeps server status visible', () => {
    const { rerender } = render(<Loading stage="正在读取你的知乎足迹" progress={5} gone={false} />)
    expect(screen.getByRole('heading', { name: '每一次好奇，都留下了光。' })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('正在读取你的知乎足迹')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5')
    rerender(<Loading stage="读到 60 条，正在理解它们讲的是什么" progress={30} gone={false} />)
    expect(screen.getByRole('heading', { name: '相似的念头，开始相认。' })).toBeVisible()
    rerender(<Loading stage="正在让它们坍缩成星群" progress={70} gone={false} />)
    expect(screen.getByRole('heading', { name: '你的宇宙，逐渐有了形状。' })).toBeVisible()
  })

  test('interaction responds without advancing actual progress', () => {
    render(<Loading stage="正在读取" progress={5} gone={false} />)
    fireEvent.click(screen.getByRole('button', { name: '轻触，扰动星尘' }))
    expect(screen.getByText('看，你也有引力。')).toBeVisible()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5')
  })

  test('errors stop the experience and expose the actual failure', () => {
    render(<Loading stage="读取" progress={5} error="请先完成知乎账号授权" gone={false} />)
    expect(screen.getByRole('alert')).toHaveTextContent('请先完成知乎账号授权')
    expect(screen.queryByRole('button', { name: '轻触，扰动星尘' })).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回入口' })).toHaveAttribute('href', '/')
  })

  test('completion removes hidden interactive content immediately', () => {
    render(<Loading stage="完成" progress={100} gone />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
