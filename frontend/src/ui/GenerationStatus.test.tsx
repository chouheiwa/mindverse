import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import type { GenerationDetails } from '../types'
import { GenerationStatus } from './GenerationStatus'
import { estimateText } from '../domain/generationEstimate'

afterEach(cleanup)
const details: GenerationDetails = {
  phase: 'analyze', done: 40, total: 100, cached: 80, failed: 2, collected: 180,
  foldersDone: 3, foldersTotal: 3, startedAt: Date.now(), updatedAt: Date.now(),
  estimateLow: 20, estimateHigh: 60,
  preview: [{ concepts: ['算法', '底层原理'], title: '真实原文', url: 'https://www.zhihu.com/question/123' }],
}
describe('actual generation feedback', () => {
  test('shows measured work, reuse, incomplete annotation and original evidence', () => {
    render(<GenerationStatus details={details} />)
    expect(screen.getByText('已处理 40 / 100 条待分析内容')).toBeVisible()
    expect(screen.getByText(/已复用 80 条历史分析/)).toHaveTextContent('2 条尚未获得有效标注')
    expect(screen.getByRole('link')).toHaveAttribute('href', details.preview![0]!.url)
    expect(screen.getByText('初步概念，仍在整理')).toBeVisible()
  })
  test('does not fabricate a zero-second countdown or estimates before samples exist', () => {
    expect(estimateText({ ...details, estimateHigh: 0 }, details.updatedAt)).toContain('正在估算')
    expect(estimateText(details, details.updatedAt + 61000)).toContain('比预计更久')
    expect(estimateText(details, details.updatedAt + 10000)).toContain('10–50 秒')
  })
  test('refuses external and executable source links', () => {
    render(<GenerationStatus details={{ ...details, preview: [
      { concepts: ['算法'], title: 'bad', url: 'javascript:alert(1)' },
      { concepts: ['算法'], title: 'bad', url: 'https://www.zhihu.com.evil.test/' },
    ] }} />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
