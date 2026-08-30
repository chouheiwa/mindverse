import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { RendererCallbacks } from '../starmap/Renderer'
import type { PlanetDatum } from '../starmap/gl/bodies'
import type { CurrentUniverse } from '../types'

const testState = vi.hoisted(() => ({
  callbacks: null as RendererCallbacks | null,
  planet: null as PlanetDatum | null,
  selectCalls: [] as Array<[string, string]>,
  restoreCalls: [] as Array<[string, string]>,
  workspaceCalls: [] as boolean[],
  suspendCalls: 0,
  resumeCalls: 0,
}))

const apiState = vi.hoisted(() => ({
  pollUntilDone: vi.fn(),
}))

vi.mock('../api', () => apiState)

vi.mock('../starmap/Renderer', () => ({
  Renderer: class MockRenderer {
    constructor(_canvas: HTMLCanvasElement, _labels: HTMLCanvasElement, _index: unknown,
      _reduceMotion: boolean, callbacks: RendererCallbacks) {
      testState.callbacks = callbacks
    }
    start() {}
    resize() {}
    destroy() {}
    setMode() {}
    resetView() { testState.callbacks?.onPick?.(null) }
    skipGenesis() {}
    clearPlanet() { testState.callbacks?.onPickPlanet?.(null) }
    setWorkspaceOpen(open: boolean) { testState.workspaceCalls.push(open) }
    suspend() { testState.suspendCalls += 1 }
    resume() { testState.resumeCalls += 1 }
    selectQuestionPlanet(starId: string, questionId: string) {
      testState.selectCalls.push([starId, questionId])
      testState.callbacks?.onPickPlanet?.(testState.planet)
      return testState.planet
    }
    restoreQuestionPlanet(starId: string, questionId: string) {
      testState.restoreCalls.push([starId, questionId])
      testState.callbacks?.onPickPlanet?.(testState.planet)
      return testState.planet
    }
  },
}))

import { UniverseView } from './Universe'

const star = {
  id: 'star:v1:private:8ed3f6ad685b959e', scope: 'private', externalQueryAllowed: false,
  questionIds: ['question:7'], probeIds: [], c: 'Alpha', g: 0, p: [0, 0, 0] as [number, number, number],
  n: 1, o: 0, f: 1, hue: 218, sat: 50, pe: 1, bu: 0, fi: '2026.01', la: '2026.01', ev: [],
} satisfies NonNullable<CurrentUniverse['stars']>[number]

const fixture = {
  schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
  meta: { items: 1, concepts: 1, clusters: 1, own: 0, fav: 1, span: [1, 2] as [number, number], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [{ g: 0, name: 'Cluster', lead: 'Alpha', c: [0, 0, 0] as [number, number, number], n: 1, o: 0, f: 1, hue: 218, sat: 50, mem: ['Alpha'] }],
  stars: [star], particles: [], wormholes: [], solo: [], dark: [], nebula: [],
  questions: [{ id: 'question:7', questionId: '7', title: '真实问题标题', url: 'https://www.zhihu.com/question/7', answerIds: ['answer:8'] }],
  answers: [{
    id: 'answer:8', questionId: 'question:7', title: '真实问题标题', summary: '摘要',
    url: 'https://www.zhihu.com/question/7/answer/8', authorName: 'Alice', publishedAt: 1,
    bindings: [], discoverySources: ['public_search'],
  }],
  probes: [],
} satisfies CurrentUniverse

const selectedPlanet = {
  question: fixture.questions[0], answers: fixture.answers, answerCount: 1,
  created: false, collected: false, latestPublicAt: 1, star: { s: star } as unknown as PlanetDatum['star'],
  index: 0, orbitIndex: 1, u: [1, 0, 0], v: [0, 1, 0], orbitR: 2.1, phase: 0, period: 10, radius: .1,
} satisfies PlanetDatum

beforeEach(() => {
  testState.callbacks = null
  testState.planet = selectedPlanet
  testState.selectCalls = []
  testState.restoreCalls = []
  testState.workspaceCalls = []
  testState.suspendCalls = 0
  testState.resumeCalls = 0
  apiState.pollUntilDone.mockResolvedValue({ universe: fixture, filtered: 0 })
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  })))
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { callback(0); return 1 }))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute('open', '') })
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) { this.removeAttribute('open') })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Universe question keyboard integration', () => {

  test('labels seed data as public samples and never renders a 1970 personal-history claim', async () => {
    apiState.pollUntilDone.mockResolvedValue({
      universe: { ...fixture, meta: { ...fixture.meta, source: 'seed', span: [0, 0] as [number, number] } },
      filtered: 0,
    })
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    expect(screen.getByText(/公开样本内容/)).toBeVisible()
    expect(screen.queryByText(/1970/)).not.toBeInTheDocument()
    expect(screen.queryByText(/你的知乎|真实的知乎收藏与创作/)).not.toBeInTheDocument()
  })
  test('opens the only public sharing action and restores focus after close', async () => {
    const user = userEvent.setup()
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    const opener = screen.getByRole('button', { name: '选择分享' })
    expect(screen.queryByRole('button', { name: '宇宙身份证' })).not.toBeInTheDocument()
    await user.click(opener)
    expect(screen.getByRole('dialog', { name: '选择分享' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '关闭分享选择' }))
    await waitFor(() => expect(opener).toHaveFocus())
  })

  test('restores focus to the mode button after its panel closes', async () => {
    const user = userEvent.setup()
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    const opener = screen.getByRole('button', { name: /灭的星$/ })
    await user.click(opener)
    await user.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(opener).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })

  test('restores focus to the accessible star map after a canvas-picked panel closes', async () => {
    const user = userEvent.setup()
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    const canvas = screen.getByLabelText('认知宇宙三维星图')
    canvas.focus()
    await waitFor(() => expect(testState.callbacks).not.toBeNull())
    act(() => testState.callbacks!.onPick?.(star))
    await user.click(await screen.findByRole('button', { name: '关闭' }))
    await waitFor(() => expect(canvas).toHaveFocus())
    expect(canvas).toHaveAttribute('tabindex', '0')
    expect(document.activeElement).not.toBe(document.body)
  })

  test('restores focus after the star breadcrumb closes its own panel', async () => {
    const user = userEvent.setup()
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    const canvas = screen.getByLabelText('认知宇宙三维星图')
    canvas.focus()
    act(() => testState.callbacks?.onPick?.(star))

    const breadcrumb = await screen.findByRole('navigation', { name: '所在层级' })
    await user.click(within(breadcrumb).getByRole('button', { name: '全景' }))

    await waitFor(() => expect(canvas).toHaveFocus())
    expect(document.activeElement).not.toBe(document.body)
  })

  test('enters directly from the panel and restores focus to its trigger', async () => {
    const user = userEvent.setup()
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    act(() => testState.callbacks?.onPick?.(star))
    const trigger = await screen.findByRole('button', { name: '进入问题行星' })
    trigger.focus()
    await user.click(trigger)
    expect(testState.selectCalls).toEqual([['star:v1:private:8ed3f6ad685b959e', 'question:7']])
    expect(screen.queryByRole('button', { name: '关闭问题行星入口' })).not.toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: '个人轨道' })).toBeVisible()
    expect(testState.suspendCalls).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '返回问题航道' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(testState.restoreCalls).toEqual([['star:v1:private:8ed3f6ad685b959e', 'question:7']])
    expect(testState.suspendCalls).toBe(testState.resumeCalls)
    expect(trigger).toHaveFocus()
  })

  test('hands lane focus to the card, enters and leaves the workspace, and clears stale entry state', async () => {
    const user = userEvent.setup()
    render(<StrictMode><UniverseView /></StrictMode>)
    await screen.findByRole('heading', { name: '好奇心星图' })

    act(() => testState.callbacks?.onPick?.(star))
    const canvas = screen.getByLabelText('认知宇宙三维星图')
    canvas.focus()
    act(() => testState.callbacks?.onPickPlanet?.(selectedPlanet))
    const planetCard = await screen.findByRole('complementary', { name: '问题行星入口' })
    expect(within(planetCard).getByRole('button', { name: '进入问题行星' })).not.toHaveFocus()
    expect(canvas).toHaveFocus()
    act(() => testState.callbacks?.onPickPlanet?.(null))

    const laneButton = await screen.findByRole('button', { name: /轨道 1.*真实问题标题/ })
    laneButton.focus()
    await user.keyboard('{Enter}')
    expect(testState.selectCalls).toEqual([['star:v1:private:8ed3f6ad685b959e', 'question:7']])
    const enter = within(await screen.findByRole('complementary', { name: '问题行星入口' }))
      .getByRole('button', { name: '进入问题行星' })
    await waitFor(() => expect(enter).toHaveFocus())

    await user.click(screen.getByRole('button', { name: '关闭问题行星入口' }))
    await waitFor(() => expect(laneButton).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(within(screen.getByRole('complementary', { name: '问题行星入口' }))
      .getByRole('button', { name: '进入问题行星' })).toHaveFocus())

    await user.keyboard('{Enter}')
    expect(testState.suspendCalls).toBeGreaterThan(0)
    expect(await screen.findByRole('tab', { name: '个人轨道' })).toBeVisible()
    const dialog = screen.getByRole('dialog')
    expect(testState.workspaceCalls).toContain(true)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(testState.restoreCalls).toEqual([['star:v1:private:8ed3f6ad685b959e', 'question:7']])
    expect(testState.workspaceCalls.at(-1)).toBe(false)
    expect(testState.resumeCalls).toBeGreaterThan(0)
    expect(laneButton).toHaveFocus()

    await user.click(laneButton)
    await user.click(within(await screen.findByRole('complementary', { name: '问题行星入口' }))
      .getByRole('button', { name: '进入问题行星' }))
    await user.click(await screen.findByRole('button', { name: '返回问题航道' }))
    await waitFor(() => expect(laneButton).toHaveFocus())

    await user.click(laneButton)
    await user.click(within(await screen.findByRole('complementary', { name: '问题行星入口' }))
      .getByRole('button', { name: '进入问题行星' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    act(() => testState.callbacks?.onPick?.(null))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    act(() => testState.callbacks?.onPick?.(star))
    const resetLaneButton = await screen.findByRole('button', { name: /轨道 1.*真实问题标题/ })
    await user.click(resetLaneButton)
    await user.click(within(await screen.findByRole('complementary', { name: '问题行星入口' }))
      .getByRole('button', { name: '进入问题行星' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '熄灭的星' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  test('moves focus back to the card when the already-selected lane item is chosen again', async () => {
    const user = userEvent.setup()
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    act(() => testState.callbacks?.onPick?.(star))

    const laneButton = await screen.findByRole('button', { name: /轨道 1.*真实问题标题/ })
    await user.click(laneButton)
    const enter = within(await screen.findByRole('complementary', { name: '问题行星入口' }))
      .getByRole('button', { name: '进入问题行星' })
    await waitFor(() => expect(enter).toHaveFocus())

    laneButton.focus()
    await user.click(laneButton)
    await waitFor(() => expect(enter).toHaveFocus())
  })
})
