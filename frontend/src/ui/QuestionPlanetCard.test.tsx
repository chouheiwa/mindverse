import { createRef } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { PlanetDatum } from '../starmap/gl/bodies'
import { QuestionPlanetCard } from './QuestionPlanetCard'

afterEach(cleanup)

const planet = (relations: Partial<Pick<PlanetDatum, 'created' | 'collected'>> = {}): PlanetDatum => ({
  question: {
    id: 'question:7',
    questionId: '7',
    title: '怎样建立一套可以不断修正的知识体系？',
    url: 'https://www.zhihu.com/question/7',
    answerIds: ['answer:8', 'answer:9'],
  },
  answerCount: 2,
  created: false,
  collected: false,
  latestPublicAt: 35,
  star: {} as PlanetDatum['star'],
  index: 0,
  u: [1, 0, 0],
  v: [0, 1, 0],
  orbitR: 2.1,
  phase: 0,
  period: 10,
  radius: 0.1,
  ...relations,
})

describe('QuestionPlanetCard', () => {
  test('shows the exact question title, answer count, and canonical original link', () => {
    render(<QuestionPlanetCard ref={createRef()} planet={planet()} onClose={() => {}} onEnter={() => {}} />)

    expect(screen.getByText('怎样建立一套可以不断修正的知识体系？')).toBeVisible()
    expect(screen.getByText('2 个回答')).toBeVisible()
    expect(screen.getByRole('link', { name: '查看知乎原问题' })).toHaveAttribute('href', 'https://www.zhihu.com/question/7')
    expect(screen.getByRole('link', { name: '查看知乎原问题' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: '查看知乎原问题' })).toHaveAttribute('rel', 'noopener noreferrer')
  })

  test.each([
    [{ created: true }, '我创作过相关回答'],
    [{ collected: true }, '我收藏过相关回答'],
    [{ created: true, collected: true }, '我创作并收藏过相关回答'],
    [{}, '公共问题'],
  ] satisfies readonly [Partial<Pick<PlanetDatum, 'created' | 'collected'>>, string][])('renders only proven personal relation %j', (relations, copy) => {
    render(<QuestionPlanetCard planet={planet(relations)} onClose={() => {}} onEnter={() => {}} />)
    expect(screen.getByText(copy)).toBeVisible()
    if (!(('created' in relations) && relations.created) && !(('collected' in relations) && relations.collected)) {
      expect(screen.queryByText(/收藏|创作/)).not.toBeInTheDocument()
    }
  })

  test('offers separate native actions and accessible close control', async () => {
    const onEnter = vi.fn()
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<QuestionPlanetCard planet={planet()} onClose={onClose} onEnter={onEnter} />)
    const enter = screen.getByRole('button', { name: '进入问题行星' })

    await user.click(enter)
    enter.focus()
    await user.keyboard('[Enter]')
    await user.keyboard(' ')
    expect(onEnter).toHaveBeenCalledTimes(3)

    await user.click(screen.getByRole('button', { name: '关闭问题行星入口' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(container.querySelector('button a, a button')).toBeNull()
  })
})
