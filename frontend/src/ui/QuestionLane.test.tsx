import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { QuestionPlanetDatum } from '../domain/universe'
import { QuestionLane } from './QuestionLane'

afterEach(cleanup)

const datum = {
  starId: 'star:1', orbitIndex: 1,
  question: { id: 'question:7', questionId: '7', title: '真实问题标题', url: 'https://www.zhihu.com/question/7', answerIds: [] },
  aggregate: {} as QuestionPlanetDatum['aggregate'], answers: [], answerCount: 0,
  created: false, collected: false,
} satisfies QuestionPlanetDatum

describe('QuestionLane', () => {
  test('offers a visible semantic keyboard route to each admitted question', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<QuestionLane planets={[datum]} selectedId={null} onSelect={onSelect} />)
    const button = screen.getByRole('button', { name: /轨道 1.*真实问题标题/ })
    button.focus()
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith(datum, button)
    expect(screen.getByRole('navigation', { name: '问题航道' })).toHaveAttribute('data-desktop-question-lane')
  })

  test('states truthfully when a legacy or current star has no admitted questions', () => {
    render(<QuestionLane planets={[]} selectedId={null} onSelect={() => {}} />)
    expect(screen.getByText('这颗恒星还没有已收录的问题行星')).toBeVisible()
  })
})
