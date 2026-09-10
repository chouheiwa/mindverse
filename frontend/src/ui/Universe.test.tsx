import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { RendererCallbacks } from '../starmap/rendererContract'
import type { PlanetDatum } from '../starmap/gl/bodies'
import type { CurrentUniverse, Star } from '../types'
import { starIdentity } from '../starmap/starIdentity'

const testState = vi.hoisted(() => ({
  moduleGate: (() => {
    let resolve: () => void = () => {}
    const promise = new Promise<void>((done) => { resolve = done })
    return { promise, resolve, requested: false }
  })(),
  callbacks: null as RendererCallbacks | null,
  planet: null as PlanetDatum | null,
  selectCalls: [] as Array<[string, string]>,
  restoreCalls: [] as Array<[string, string]>,
  workspaceCalls: [] as boolean[],
  suspendCalls: 0,
  resumeCalls: 0,
  destroyCalls: 0,
  approachCalls: [] as Array<[string, number]>,
  scanCalls: [] as Array<[string, number]>,
  exitProbeCalls: 0,
  poseCalls: [] as unknown[],
  partCalls: [] as unknown[],
  reducedCalls: [] as boolean[],
  focusCalls: [] as string[],
  focusResult: null as Star | null,
  focusPickResult: null as Star | null,
  orbitCalls: [] as Array<[number, number]>,
  strataEnterCalls: [] as unknown[],
  surfaceEnterCalls: [] as string[],
  surfaceExitCalls: 0,
  strataMoveCalls: [] as unknown[],
  strataExitCalls: [] as number[],
  closeSpecimenCalls: 0,
  createCalls: 0,
}))

const apiState = vi.hoisted(() => ({
  pollUntilDone: vi.fn(),
}))

vi.mock('../api', () => apiState)

vi.mock('virtual:mindverse-renderer', async () => {
  testState.moduleGate.requested = true
  await testState.moduleGate.promise
  return { createRenderer: (_canvas: HTMLCanvasElement, _labels: HTMLCanvasElement, _index: unknown,
    _reduceMotion: boolean, callbacks: RendererCallbacks) => new class MockRenderer {
    constructor() {
      testState.createCalls += 1
      testState.callbacks = callbacks
    }
    start() {}
    resize() {}
    destroy() { testState.destroyCalls += 1 }
    setMode() {}
    focusStar(starKey: string) {
      testState.focusCalls.push(starKey)
      if (testState.focusPickResult) testState.callbacks?.onPick?.(testState.focusPickResult)
      return testState.focusResult
    }
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
    approachProbe(probeId: string, token: number) {
      testState.approachCalls.push([probeId, token])
      testState.callbacks?.onPickPlanet?.(null)
    }
    startProbeScan(probeId: string, token: number) { testState.scanCalls.push([probeId, token]) }
    exitProbeInspection() { testState.exitProbeCalls += 1 }
    setProbeInspectionPose(pose: unknown) { testState.poseCalls.push(pose) }
    focusProbePart(part: unknown) { testState.partCalls.push(part) }
    setReducedMotion(reduced: boolean) { testState.reducedCalls.push(reduced) }
    orbitWorkspace(dx: number, dy: number) { testState.orbitCalls.push([dx, dy]) }
    enterPlanetSurface(questionId: string) { testState.surfaceEnterCalls.push(questionId); return true }
    exitPlanetSurface() { testState.surfaceExitCalls += 1 }
    enterStrata(request: unknown) { testState.strataEnterCalls.push(request) }
    moveStrata(intent: unknown) { testState.strataMoveCalls.push(intent) }
    exitStrata(token: number) { testState.strataExitCalls.push(token) }
    closeAnswerSpecimen() { testState.closeSpecimenCalls += 1 }
  }() }
})

import { UniverseView } from './Universe'

const star = {
  id: 'star:v1:private:8ed3f6ad685b959e', scope: 'private', externalQueryAllowed: false,
  questionIds: ['question:7'], probeIds: ['article:21'], c: 'Alpha', g: 0, p: [0, 0, 0] as [number, number, number],
  n: 1, o: 0, f: 1, hue: 218, sat: 50, pe: 1, bu: 0, fi: '2026.01', la: '2026.01', ev: [],
} satisfies NonNullable<CurrentUniverse['stars']>[number]

const siblingStar = {
  ...star,
  id: 'star:v1:private:f44e64e75f3948e9', c: 'Beta', p: [1, 0, 0] as [number, number, number],
  questionIds: [], probeIds: [],
} satisfies NonNullable<CurrentUniverse['stars']>[number]

const canonicalSiblingStar = {
  ...siblingStar,
  c: 'Renderer canonical Beta',
} satisfies Star

const fixture = {
  schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
  meta: { items: 1, concepts: 1, clusters: 1, own: 0, fav: 1, span: [1, 2] as [number, number], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [{ g: 0, name: 'Cluster', lead: 'Alpha', c: [0, 0, 0] as [number, number, number], n: 2, o: 0, f: 2, hue: 218, sat: 50, mem: ['Alpha', 'Beta'] }],
  stars: [star, siblingStar], particles: [], wormholes: [], solo: [], dark: [], nebula: [],
  questions: [{ id: 'question:7', questionId: '7', title: '真实问题标题', url: 'https://www.zhihu.com/question/7', answerIds: ['answer:8'] }],
  answers: [{
    id: 'answer:8', questionId: 'question:7', title: '真实问题标题', summary: '摘要',
    url: 'https://www.zhihu.com/question/7/answer/8', authorName: 'Alice', publishedAt: 1,
    bindings: [], discoverySources: ['public_search'],
  }],
  probes: [{ id: 'article:21', title: '真实文章标题', url: 'https://zhuanlan.zhihu.com/p/21',
    authorName: 'Bob', bindings: [], discoverySources: ['public_search'] }],
} satisfies CurrentUniverse

const selectedPlanet = {
  question: fixture.questions[0], answers: fixture.answers, answerCount: 1,
  created: false, collected: false, latestPublicAt: 1, star: { s: star } as unknown as PlanetDatum['star'],
  material: {
    seed: .1, family: 'basalt', answerDensity: .2, timeSpan: null, freshness: .35,
    divergence: null, created: false, collected: false,
  },
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
  testState.destroyCalls = 0
  testState.approachCalls = []
  testState.scanCalls = []
  testState.exitProbeCalls = 0
  testState.poseCalls = []
  testState.partCalls = []
  testState.reducedCalls = []
  testState.focusCalls = []
  testState.focusResult = null
  testState.focusPickResult = null
  testState.orbitCalls = []
  testState.strataEnterCalls = []
  testState.surfaceEnterCalls = []
  testState.surfaceExitCalls = 0
  testState.strataMoveCalls = []
  testState.strataExitCalls = []
  testState.closeSpecimenCalls = 0
  testState.createCalls = 0
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

  test('does not create a renderer when its module resolves after unmount', async () => {
    const view = render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    await waitFor(() => expect(testState.moduleGate.requested).toBe(true))

    view.unmount()
    testState.moduleGate.resolve()
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    expect(testState.createCalls).toBe(0)
  })

  test('destroys one mounted renderer exactly once on unmount', async () => {
    const view = render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    await waitFor(() => expect(testState.createCalls).toBe(1))

    view.unmount()

    expect(testState.destroyCalls).toBe(1)
  })

  test('inspects and scans an article probe with token guards and restores its trigger on Escape', async () => {
    const user = userEvent.setup()
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    await waitFor(() => expect(testState.callbacks).not.toBeNull())
    act(() => testState.callbacks?.onPick?.(star))
    const trigger = await screen.findByRole('button', { name: '检查探测器' })
    await user.click(trigger)
    expect(testState.approachCalls).toEqual([['article:21', 1]])
    expect(screen.queryByRole('heading', { name: /检查探测器/ })).not.toBeInTheDocument()

    act(() => testState.callbacks?.onProbeArrived?.({ probeId: 'article:wrong', token: 1 }))
    act(() => testState.callbacks?.onProbeArrived?.({ probeId: 'article:21', token: 99 }))
    expect(screen.queryByRole('heading', { name: /检查探测器/ })).not.toBeInTheDocument()
    act(() => testState.callbacks?.onProbeArrived?.({ probeId: 'article:21', token: 1 }))
    expect(await screen.findByRole('heading', { name: '检查探测器：真实文章标题' })).toHaveFocus()
    expect(screen.queryByRole('link', { name: '查看原文章' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '开始扫描' }))
    expect(testState.scanCalls).toEqual([['article:21', 2]])
    act(() => testState.callbacks?.onProbeError?.({ probeId: 'article:21', token: 2, cause: new Error('secret /tmp/scan.stack') }))
    expect(screen.getByRole('heading', { name: '检查探测器：真实文章标题' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('扫描失败，请重试。')
    expect(screen.queryByText(/secret|scan\.stack/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '查看原文章' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '开始扫描' }))
    expect(testState.scanCalls).toEqual([['article:21', 2], ['article:21', 3]])
    act(() => testState.callbacks?.onProbeScanComplete?.({ probeId: 'article:21', token: 2 }))
    expect(screen.queryByRole('link', { name: '查看原文章' })).not.toBeInTheDocument()
    act(() => testState.callbacks?.onProbeScanComplete?.({ probeId: 'article:21', token: 3 }))
    expect(screen.getByRole('link', { name: '查看原文章' })).toHaveAttribute('href', 'https://zhuanlan.zhihu.com/p/21')

    await user.click(screen.getByRole('button', { name: '重新扫描' }))
    expect(screen.getByRole('status')).toHaveTextContent('正在扫描当前探测器。')
    expect(screen.getByRole('link', { name: '查看原文章' })).toHaveAttribute('href', 'https://zhuanlan.zhihu.com/p/21')
    act(() => testState.callbacks?.onProbeError?.({ probeId: 'article:wrong', token: 4, cause: new Error('late') }))
    expect(screen.getByRole('status')).toHaveTextContent('正在扫描当前探测器。')
    act(() => testState.callbacks?.onProbeError?.({ probeId: 'article:21', token: 4, cause: new Error('again') }))
    expect(screen.getByRole('status')).toHaveTextContent('扫描失败，请重试。')
    expect(screen.getByRole('link', { name: '查看原文章' })).toHaveAttribute('href', 'https://zhuanlan.zhihu.com/p/21')

    await user.keyboard('{Escape}')
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(testState.exitProbeCalls).toBeGreaterThan(0)
  })

  test('falls back to the canvas when the inspection trigger is no longer connected', async () => {
    const user = userEvent.setup()
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    await waitFor(() => expect(testState.callbacks).not.toBeNull())
    act(() => testState.callbacks?.onPick?.(star))
    const trigger = await screen.findByRole('button', { name: '检查探测器' })
    await user.click(trigger)
    act(() => testState.callbacks?.onProbeArrived?.({ probeId: 'article:21', token: 1 }))
    await screen.findByRole('dialog', { name: '检查探测器：真实文章标题' })
    vi.spyOn(trigger, 'isConnected', 'get').mockReturnValue(false)
    const canvas = document.querySelector<HTMLCanvasElement>('.uv-canvas:not(.uv-labels)')

    await user.keyboard('{Escape}')

    await waitFor(() => expect(canvas).toHaveFocus())
  })

  test('forwards runtime reduced-motion changes and removes the listener on unmount', async () => {
    let listener: ((event: MediaQueryListEvent) => void) | null = null
    const removeEventListener = vi.fn()
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn((_type: string, next: (event: MediaQueryListEvent) => void) => { listener = next }),
      removeEventListener,
    })))
    const view = render(<StrictMode><UniverseView /></StrictMode>)
    await screen.findByRole('heading', { name: '好奇心星图' })
    await waitFor(() => expect(listener).not.toBeNull())
    act(() => listener?.({ matches: true } as MediaQueryListEvent))
    expect(testState.reducedCalls).toContain(true)
    view.unmount()
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

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

  test('starts loading, becomes ready, and shows a remount fallback after renderer failure', async () => {
    const user = userEvent.setup()
    const removeListener = vi.spyOn(window, 'removeEventListener')
    render(<UniverseView />)
    const root = await screen.findByTestId('universe-root')
    expect(root).toHaveAttribute('data-render-state', 'loading')
    await waitFor(() => expect(testState.callbacks).not.toBeNull())
    act(() => testState.callbacks?.onRenderReady?.())
    expect(root).toHaveAttribute('data-render-state', 'ready')

    act(() => testState.callbacks?.onRenderError?.(new Error('WebGL context lost')))
    expect(root).toHaveAttribute('data-render-state', 'failed')
    expect(screen.getByRole('heading', { name: '3D 星图暂时不可用' })).toBeVisible()
    expect(testState.destroyCalls).toBe(1)
    expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function))
    await user.click(screen.getByRole('button', { name: '重试 3D' }))
    await waitFor(() => expect(testState.callbacks).not.toBeNull())
    expect(root).toHaveAttribute('data-render-state', 'loading')
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

  test('routes a concept-list selection through the renderer and opens its canonical star', async () => {
    const user = userEvent.setup()
    testState.focusResult = canonicalSiblingStar
    testState.focusPickResult = siblingStar
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    await waitFor(() => expect(testState.callbacks).not.toBeNull())
    const canvas = screen.getByLabelText('认知宇宙三维星图')
    canvas.focus()
    act(() => testState.callbacks?.onPick?.(star))

    await user.click(await screen.findByRole('button', { name: 'Beta' }))

    expect(testState.focusCalls).toEqual([starIdentity(siblingStar)])
    expect(await screen.findByRole('heading', { name: canonicalSiblingStar.c })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() => expect(canvas).toHaveFocus())
  })

  test('keeps the current star panel when the renderer rejects a concept-list selection', async () => {
    const user = userEvent.setup()
    testState.focusResult = null
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    await waitFor(() => expect(testState.callbacks).not.toBeNull())
    act(() => testState.callbacks?.onPick?.(star))

    await user.click(await screen.findByRole('button', { name: 'Beta' }))

    expect(testState.focusCalls).toEqual([starIdentity(siblingStar)])
    expect(screen.getByRole('heading', { name: star.c })).toBeVisible()
    expect(screen.queryByRole('heading', { name: siblingStar.c })).not.toBeInTheDocument()
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
    await waitFor(() => expect(testState.callbacks).not.toBeNull())
    act(() => testState.callbacks?.onPick?.(star))
    const trigger = await screen.findByRole('button', { name: '进入问题行星' })
    trigger.focus()
    await user.click(trigger)
    expect(testState.selectCalls).toEqual([['star:v1:private:8ed3f6ad685b959e', 'question:7']])
    expect(screen.queryByRole('button', { name: '关闭问题行星入口' })).not.toBeInTheDocument()
    // 进入行星现在是落到地表，2D 工作台随即可见 —— 不必先退出地层。
    expect(await screen.findByRole('tab', { name: '我的证据轨迹' })).toBeVisible()
    expect(testState.suspendCalls).toBe(0)
    await user.click(screen.getByRole('button', { name: '返回问题航道' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(testState.restoreCalls).toEqual([['star:v1:private:8ed3f6ad685b959e', 'question:7']])
    expect(testState.suspendCalls).toBe(testState.resumeCalls)
    // 断言「焦点回到入口按钮」，不是「回到同一个对象」：地层往返会把面板
    // 重挂载，握旧节点会把「行为正确」误判成「焦点丢了」。
    expect(document.querySelector('[data-focus-return="question-entry:question:7"]')).toHaveFocus()
    expect(trigger.textContent).toBe('进入问题行星')
  })

  test('crosses from the observatory into strata, opens evidence, and exits with one token', async () => {
    const user = userEvent.setup()
    render(<UniverseView />)
    await screen.findByRole('heading', { name: '好奇心星图' })
    await waitFor(() => expect(testState.callbacks).not.toBeNull())
    act(() => testState.callbacks?.onPick?.(star))
    await user.click(await screen.findByRole('button', { name: '进入问题行星' }))
    // 落到地表之后，往脚下挖才进答案地层 —— 这是单独一步。
    await user.click(await screen.findByRole('button', { name: '打开答案地层' }))
    await waitFor(() => expect(testState.strataEnterCalls).toHaveLength(1))
    expect(testState.strataEnterCalls[0]).toMatchObject({ token: 1, questionId: 'question:7' })

    act(() => testState.callbacks?.onStrataPhase?.({ token: 1, questionId: 'question:7', phase: 'surface-crossing' }))
    act(() => testState.callbacks?.onStrataPhase?.({ token: 1, questionId: 'question:7', phase: 'strata-free' }))
    expect(await screen.findByRole('region', { name: '答案地层导航' })).toBeVisible()
    expect(screen.queryByRole('dialog', { name: '真实问题标题' })).not.toBeInTheDocument()

    act(() => testState.callbacks?.onAnswerSpecimenFocus?.({
      token: 1, questionId: 'question:7', answerId: 'answer:8',
      pose: { depth: 1.2, yaw: 0, pitch: 0, snapId: null },
    }))
    expect(await screen.findByRole('dialog', { name: '真实问题标题' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: '关闭答案证据板' }))
    expect(testState.closeSpecimenCalls).toBe(1)

    await user.click(screen.getByRole('button', { name: '返回行星表面' }))
    expect(testState.strataExitCalls).toEqual([1])
    act(() => testState.callbacks?.onStrataExited?.({ token: 1, questionId: 'question:7' }))
    expect(await screen.findByRole('tab', { name: '我的证据轨迹' })).toBeVisible()
  })

  test('hands lane focus to the card, enters and leaves the workspace, and clears stale entry state', async () => {
    const user = userEvent.setup()
    render(<StrictMode><UniverseView /></StrictMode>)
    await screen.findByRole('heading', { name: '好奇心星图' })
    await waitFor(() => expect(testState.callbacks).not.toBeNull())

    act(() => testState.callbacks!.onPick?.(star))
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
    await waitFor(() => expect(focusReturnTarget('lane:question:7')).toHaveFocus())
    await user.keyboard('{Enter}')
    await waitFor(() => expect(within(screen.getByRole('complementary', { name: '问题行星入口' }))
      .getByRole('button', { name: '进入问题行星' })).toHaveFocus())

    await user.keyboard('{Enter}')
    expect(testState.suspendCalls).toBe(0)
    expect(await screen.findByRole('tab', { name: '我的证据轨迹' })).toBeVisible()
    const stage = screen.getByRole('region', { name: '行星地表' })
    fireEvent(stage, new MouseEvent('pointerdown', { bubbles: true, clientX: 20, clientY: 30 }))
    fireEvent(stage, new MouseEvent('pointermove', { bubbles: true, clientX: 42, clientY: 19 }))
    fireEvent(stage, new MouseEvent('pointerup', { bubbles: true, clientX: 42, clientY: 19 }))
    expect(testState.orbitCalls).toEqual([[22, -11]])
    const dialog = screen.getByRole('dialog')
    expect(testState.workspaceCalls).toContain(true)
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(testState.restoreCalls).toEqual([['star:v1:private:8ed3f6ad685b959e', 'question:7']])
    expect(testState.workspaceCalls.at(-1)).toBe(false)
    expect(testState.resumeCalls).toBe(0)
    expect(focusReturnTarget('lane:question:7')).toHaveFocus()

    await user.click(laneButton)
    await user.click(within(await screen.findByRole('complementary', { name: '问题行星入口' }))
      .getByRole('button', { name: '进入问题行星' }))
    await user.click(await screen.findByRole('button', { name: '返回问题航道' }))
    await waitFor(() => expect(focusReturnTarget('lane:question:7')).toHaveFocus())

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
    await waitFor(() => expect(testState.callbacks).not.toBeNull())
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

/** 焦点归还断言按标记走：地层往返会重挂载来路按钮，握旧节点会把「行为正确」误判成「焦点丢了」。 */
const focusReturnTarget = (key: string) => document.querySelector(`[data-focus-return="${key}"]`)


test('entering a question planet flies into the atmosphere, and leaving does not pull you back in', async () => {
  const user = userEvent.setup()
  render(<UniverseView />)
  await screen.findByRole('heading', { name: '好奇心星图' })
  await waitFor(() => expect(testState.callbacks).not.toBeNull())
  act(() => testState.callbacks?.onPick?.(star))

  await user.click(await screen.findByRole('button', { name: '进入问题行星' }))
  await user.click(await screen.findByRole('button', { name: '打开答案地层' }))
  await waitFor(() => expect(testState.strataEnterCalls).toHaveLength(1))
  expect(testState.strataEnterCalls[0]).toMatchObject({ token: 1, questionId: 'question:7' })

  act(() => testState.callbacks?.onStrataPhase?.({ token: 1, questionId: 'question:7', phase: 'surface-crossing' }))
  act(() => testState.callbacks?.onStrataPhase?.({ token: 1, questionId: 'question:7', phase: 'strata-free' }))
  expect(await screen.findByRole('region', { name: '答案地层导航' })).toBeVisible()

  await user.click(screen.getByRole('button', { name: '返回行星表面' }))
  act(() => testState.callbacks?.onStrataExited?.({ token: 1, questionId: 'question:7' }))
  expect(await screen.findByRole('tab', { name: '我的证据轨迹' })).toBeVisible()
  await waitFor(() => expect(testState.strataEnterCalls).toHaveLength(1))
  expect(screen.queryByRole('region', { name: '答案地层导航' })).not.toBeInTheDocument()
})

test('entering a question planet lands on its surface, and digging is a separate step', async () => {
  const user = userEvent.setup()
  render(<UniverseView />)
  await screen.findByRole('heading', { name: '好奇心星图' })
  await waitFor(() => expect(testState.callbacks).not.toBeNull())
  act(() => testState.callbacks?.onPick?.(star))

  await user.click(await screen.findByRole('button', { name: '进入问题行星' }))

  // 进来先站到地表上 —— 这一步不该直接把人塞进地层。
  await waitFor(() => expect(testState.surfaceEnterCalls).toEqual(['question:7']))
  expect(testState.strataEnterCalls).toHaveLength(0)

  // 返回问题航道就是离开地表：否则宇宙一直关着、相机一直被地表占着，人被困在球上。
  await user.click(await screen.findByRole('button', { name: '返回问题航道' }))
  await waitFor(() => expect(testState.surfaceExitCalls).toBe(1))
})
