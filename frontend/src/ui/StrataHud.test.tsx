import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { buildStrataSceneModel } from '../domain/strata'
import { makeStrataFixture, strataFixture } from '../test/strataFixture'
import { StrataHud } from './StrataHud'

afterEach(cleanup)
const scene = buildStrataSceneModel(strataFixture.index, 'question:7')
const callbacks = () => ({ onMove: vi.fn(), onPick: vi.fn(), onExit: vi.fn(), onReadAnswer: vi.fn() })

test('connects the planet, current year layer and actual answer to specimen focus', () => {
  const actions = callbacks()
  const layer = scene.strata[0]
  const view = render(<StrataHud scene={scene} phase="strata-free" questionTitle="固定地层问题"
    pose={{ depth: layer.centerDepth - 1, yaw: 0, pitch: 0, snapId: null }}
    answers={strataFixture.index.answersById} {...actions} />)
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('固定地层问题')
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('2024 年')
  fireEvent.click(screen.getAllByRole('button', { name: /定位晶体并阅读/ })[0])
  expect(actions.onReadAnswer).toHaveBeenCalledWith(layer.specimens[0].answerId)
  const oldLayer = scene.strata.at(-1)!
  view.rerender(<StrataHud scene={scene} phase="strata-free" questionTitle="固定地层问题"
    pose={{ depth: oldLayer.centerDepth, yaw: 0, pitch: 0, snapId: null }}
    answers={strataFixture.index.answersById} {...actions} />)
  expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('2020 年')
  expect(screen.getByRole('img')).toHaveAccessibleName(/第 2 层/)
})

test('reading the layer panel does not scroll the camera and transition buttons are disabled', () => {
  const actions = callbacks()
  const view = render(<StrataHud scene={scene} pose={null} phase="strata-free" {...actions} />)
  fireEvent.wheel(screen.getByRole('complementary', { name: '当前岩层的回答' }), { deltaY: 100 })
  expect(actions.onMove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '↓ 下潜' }))
  expect(actions.onMove).toHaveBeenCalledWith({ forward: 1, yaw: 0, pitch: 0 })
  view.rerender(<StrataHud scene={scene} pose={null} phase="surface-crossing" {...actions} />)
  expect(screen.getByRole('button', { name: '↓ 下潜' })).toBeDisabled()
})

test('a small sample remains explorable without inventing historical layers', () => {
  const fixture = makeStrataFixture({ datedCount: 2 })
  const surface = buildStrataSceneModel(fixture.index, 'question:7')
  render(<StrataHud scene={surface} pose={null} phase="strata-free" answers={fixture.index.answersById} {...callbacks()} />)
  const panel = screen.getByRole('complementary', { name: '当前岩层的回答' })
  expect(within(panel).getByText(/暂不足以划分年代/)).toBeVisible()
  expect(within(panel).getAllByRole('button', { name: /定位晶体并阅读/ })).toHaveLength(2)
})
