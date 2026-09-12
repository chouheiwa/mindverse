import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ArticleProbe, Generation, Mode, Star, Universe as U } from '../types'
import { pollUntilDone } from '../api'
import type { MindverseRenderer } from '../starmap/rendererContract'
import type { StrataPose } from '../starmap/rendererContract'
import { Loading } from './Loading'
import { Panel } from './Panel'
import { InfoPanel } from './InfoPanel'
import { ModeBar } from './ModeBar'
import { indexUniverse, selectPlanetData, type QuestionPlanetDatum } from '../domain/universe'
import { QuestionPlanetCard } from './QuestionPlanetCard'
import { QuestionLane } from './QuestionLane'
import type { PlanetDatum } from '../starmap/gl/bodies'
import { Seed } from './Seed'
import { QuestionWorkspaceGate } from './QuestionWorkspaceGate'
import { SharePreview } from './SharePreview'
import { RenderFallback } from './RenderFallback'
import { ProbeInspectionPanel } from './ProbeInspectionPanel'
import type { ProbePart } from '../starmap/gl/probe'
import { starIdentity } from '../starmap/starIdentity'
import { initialUniverseUiState, universeUiReducer } from './explorationState'
import { buildStrataSceneModel, type StrataSceneModel } from '../domain/strata'
import { StrataHud } from './StrataHud'
import { AnswerEvidencePanel } from './AnswerEvidencePanel'
import { describeQuestionProvenance } from '../domain/questionProvenance'
import { nextStationAfter } from '../domain/nextStation'
import './Universe.css'

const reduceMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const safeProbeScanError = (cause: unknown) => cause instanceof Error && cause.name === 'AbortError'
  ? '扫描已中断，请重试。' : '扫描失败，请重试。'

export function UniverseView() {
  return <PrivateUniverseView />
}

export function PrivateUniverseView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 标签单独一层 2D 画布：文字该用文字渲染器画，也不该被 bloom 糊掉
  const labelRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<MindverseRenderer | null>(null)

  const [gen, setGen] = useState<Pick<Generation, 'stage' | 'progress'>>({
    stage: '正在读取你的知乎足迹', progress: 6,
  })
  const [universe, setUniverse] = useState<U | null>(null)
  const [filtered, setFiltered] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const cardSizeRef = useRef({ width: 332, height: 180 })
  const focusReturnRef = useRef<HTMLButtonElement | null>(null)
  /** 来路按钮的 data-focus-return 标记，用于它被重新挂载后找回。 */
  const focusReturnKeyRef = useRef<string | null>(null)
  const panelFocusReturnRef = useRef<HTMLElement | null>(null)
  const focusCardFromLaneRef = useRef(false)
  const [genesisDone, setGenesisDone] = useState(reduceMotion())
  const [hint, setHint] = useState(false)
  const [sharing, setSharing] = useState(false)
  const shareReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  // 显式进入游客模式，或生成失败后由用户选择改走种子星
  const [seeding, setSeeding] = useState(
    () => new URLSearchParams(location.search).get('seed') === '1',
  )
  const [reload, setReload] = useState(0)
  const [rendererAttempt, setRendererAttempt] = useState(0)
  const [uiState, dispatchUi] = useReducer(universeUiReducer, initialUniverseUiState)
  const exploration = uiState.exploration
  const star = 'star' in exploration ? exploration.star : null
  const planet = exploration.kind === 'planet-focus' ? exploration.planet : null
  const { questionEntry, mode, wormIdx } = uiState
  const probeState = exploration.kind === 'probe-approach' || exploration.kind === 'probe-inspection' || exploration.kind === 'probe-scanning'
    ? exploration : null
  const strataState = exploration.kind === 'surface-approach' || exploration.kind === 'surface-crossing'
    || exploration.kind === 'strata-free' || exploration.kind === 'strata-snapped'
    || exploration.kind === 'answer-specimen-focus' || exploration.kind === 'strata-exiting'
    ? exploration : null
  const questionWorkspaceVisible = questionEntry !== null
    && (exploration.kind === 'planet-observatory' || exploration.kind === 'surface-approach')
  const explorationRef = useRef(exploration)
  explorationRef.current = exploration
  const transitionTokenRef = useRef(0)
  const probeCommandActiveRef = useRef(false)
  const probeCommandKindRef = useRef<'approach' | 'scan' | null>(null)
  const probeReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  const [selectedProbePart, setSelectedProbePart] = useState<ProbePart | null>(null)
  const [strataScene, setStrataScene] = useState<StrataSceneModel | null>(null)
  const [strataPose, setStrataPose] = useState<StrataPose | null>(null)
  const strataPoseReportedAtRef = useRef(0)
  const strataFocusProxyRef = useRef<HTMLButtonElement>(null)
  const cancelActiveProbe = useCallback(() => {
    if (!probeCommandActiveRef.current) return
    probeCommandActiveRef.current = false
    probeCommandKindRef.current = null
    transitionTokenRef.current += 1
    rendererRef.current?.exitProbeInspection()
  }, [])
  const setStar = useCallback((value: Star | null) => dispatchUi(value ? { type: 'focus-star', star: value } : { type: 'show-panorama' }), [])
  const setPlanet = useCallback((value: PlanetDatum | null) => {
    if (value) dispatchUi({ type: 'focus-planet', star: value.star.s, planet: value })
    else dispatchUi({ type: 'clear-planet' })
  }, [])
  const setQuestionEntry = useCallback((value: PlanetDatum | null) => dispatchUi({ type: 'set-question-entry', questionEntry: value }), [])
  const setMode = useCallback((value: Mode) => dispatchUi({ type: 'set-mode', mode: value }), [])
  const setWormIdx = useCallback((value: number) => dispatchUi({ type: 'set-worm', wormIdx: value }), [])
  const universeIndex = useMemo(() => universe ? indexUniverse(universe) : null, [universe])
  const questionPlanets = useMemo(
    () => universeIndex && star ? selectPlanetData(universeIndex, star) : [],
    [universeIndex, star],
  )
  const questionProvenance = useMemo(() => {
    if (!universeIndex || !questionEntry || !('id' in questionEntry.star.s)) return null
    return describeQuestionProvenance(universeIndex, questionEntry.question.id, {
      starId: questionEntry.star.s.id, orbitIndex: questionEntry.orbitIndex, orbitCount: questionPlanets.length,
    })
  }, [questionEntry, questionPlanets.length, universeIndex])

  // 取数据：分享页读快照，否则轮询生成
  useEffect(() => {
    if (seeding) return
    const ac = new AbortController()
    ;(async () => {
      try {
        const g = await pollUntilDone((p) => setGen({ stage: p.stage, progress: p.progress }), ac.signal)
        setUniverse(g.universe!)
        setFiltered(g.filtered)
      } catch (e) {
        if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => ac.abort()
  }, [seeding, reload])

  // 挂渲染器：canvas 由它独占，不随 React 重渲染
  useEffect(() => {
    if (!universeIndex || !canvasRef.current || !labelRef.current) return
    const canvas = canvasRef.current
    const labels = labelRef.current
    let disposed = false
    let teardownDone = false
    let resizeBound = false
    let rendererModuleLoaded = false
    let instance: MindverseRenderer | null = null
    let hintTimer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => instance?.resize()
    const teardown = () => {
      if (teardownDone) return
      teardownDone = true
      disposed = true
      probeCommandActiveRef.current = false
      probeCommandKindRef.current = null
      transitionTokenRef.current += 1
      if (resizeBound) {
        window.removeEventListener('resize', onResize)
        resizeBound = false
      }
      instance?.destroy()
      if (hintTimer !== null) clearTimeout(hintTimer)
      if (rendererRef.current === instance) rendererRef.current = null
    }
    const mountRenderer = async () => {
      const { createRenderer } = await import('virtual:mindverse-renderer')
      rendererModuleLoaded = true
      if (disposed) return
      const r = createRenderer(canvas, labels, universeIndex, reduceMotion(), {
      onPick: (s) => {
        cancelActiveProbe()
        if (s) {
          const active = document.activeElement
          panelFocusReturnRef.current = active instanceof HTMLElement && active.matches(
            'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ) ? active : canvasRef.current
        }
        setQuestionEntry(null)
        setPlanet(null)
        focusReturnRef.current = null
        focusCardFromLaneRef.current = false
        setStar(s)
        if (s) setMode('all')
      },
      onPickPlanet: (selected) => {
        if (probeCommandActiveRef.current && selected === null) return
        cancelActiveProbe()
        setQuestionEntry(null)
        if (selected && !focusCardFromLaneRef.current) focusReturnRef.current = null
        setPlanet(selected)
      },
      // 命令式定位：行星一直在动，这里每帧都会被调用
      onAnchor: (x, y, visible) => {
        const el = cardRef.current
        if (!el) return
        el.style.visibility = visible ? 'visible' : 'hidden'
        // 贴边时把卡片收回视口内
        const { width: w, height: h } = cardSizeRef.current
        const cx = Math.min(Math.max(x, w / 2 + 12), innerWidth - w / 2 - 12)
        // 行星靠近顶部时卡片翻到它下面，否则会盖住标题
        const below = y < h + 40
        el.classList.toggle('below', below)
        el.style.transform = below
          ? `translate(-50%, 0) translate(${cx}px, ${y + 20}px)`
          : `translate(-50%, -100%) translate(${cx}px, ${y - 16}px)`
      },
      onGenesisEnd: () => {
        setGenesisDone(true)
        setHint(true)
        hintTimer = setTimeout(() => setHint(false), 6000)
      },
      onRenderReady: () => {
        if (!disposed) dispatchUi({ type: 'render-ready' })
      },
      onRenderError: (cause) => {
        if (!disposed) {
          teardown()
          dispatchUi({ type: 'render-failed', message: cause.message, recovery: 'remount' })
        }
      },
      onProbeArrived: ({ probeId, token }) => {
        if (transitionTokenRef.current === token) probeCommandKindRef.current = null
        dispatchUi({ type: 'probe-arrived', probeId, token })
      },
      onProbeScanComplete: ({ probeId, token }) => {
        if (transitionTokenRef.current === token) probeCommandKindRef.current = null
        dispatchUi({ type: 'probe-scan-complete', probeId, token })
      },
      onProbePartChange: (part) => setSelectedProbePart(part),
      onProbeError: ({ probeId, token, cause }) => {
        if (transitionTokenRef.current === token) {
          const current = explorationRef.current
          const commandKind = probeCommandKindRef.current
          probeCommandKindRef.current = null
          if (commandKind === 'approach') {
            probeCommandActiveRef.current = false
            rendererRef.current?.exitProbeInspection()
          }
          const returnTo = current.kind === 'probe-approach' || current.kind === 'probe-scanning'
            ? current.returnTo : current.kind === 'planet-focus' ? current : null
          if (commandKind === 'approach' && returnTo?.kind === 'planet-focus'
            && 'id' in returnTo.star && typeof returnTo.star.id === 'string') {
            rendererRef.current?.restoreQuestionPlanet(returnTo.star.id, returnTo.planet.question.id)
          }
        }
        dispatchUi({ type: 'probe-error', probeId, token, message: safeProbeScanError(cause) })
      },
      onStrataPhase: ({ questionId, token, phase, ...event }) => {
        dispatchUi({
          type: 'strata-phase', questionId, token, phase,
          ...('snapId' in event ? { snapId: event.snapId } : {}),
        })
      },
      onStrataExited: ({ questionId, token }) => {
        setStrataScene(null)
        setStrataPose(null)
        dispatchUi({ type: 'strata-exited', questionId, token })
      },
      onStrataPose: ({ pose }) => {
        const now = performance.now()
        if (now - strataPoseReportedAtRef.current < 80) return
        strataPoseReportedAtRef.current = now
        setStrataPose(pose)
      },
      onAnswerSpecimenFocus: ({ token, questionId, answerId, pose }) => {
        dispatchUi({ type: 'focus-answer-specimen', token, questionId, answerId, pose })
      },
      onStrataError: ({ token, questionId, scope }) => {
        if (scope === 'transition') {
          setStrataScene(null)
          setStrataPose(null)
        }
        dispatchUi({ type: 'strata-error', token, questionId, scope })
      },
      })
      if (disposed) {
        r.destroy()
        return
      }
      instance = r
      rendererRef.current = r
      r.setMode(mode, wormIdx)
      r.start()
      window.addEventListener('resize', onResize)
      resizeBound = true
    }
    void mountRenderer().catch((cause: unknown) => {
      if (!disposed) {
        const recovery = rendererModuleLoaded ? 'remount' : 'reload'
        teardown()
        dispatchUi({
          type: 'render-failed',
          message: cause instanceof Error ? cause.message : String(cause),
          recovery,
        })
      }
    })
    return teardown
    // Renderer lifecycle follows the immutable universe index. Current mode is applied on mount
    // and subsequent changes flow through the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeIndex, rendererAttempt])

  useEffect(() => {
    const element = cardRef.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry?.contentRect.width > 0 && entry.contentRect.height > 0) {
        cardSizeRef.current = { width: entry.contentRect.width, height: entry.contentRect.height }
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [planet])

  useEffect(() => {
    if (!planet || !focusCardFromLaneRef.current) return
    focusCardFromLaneRef.current = false
    const frame = requestAnimationFrame(() => {
      cardRef.current?.querySelector<HTMLButtonElement>('[data-question-primary]')?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [planet])

  useEffect(() => { rendererRef.current?.setMode(mode, wormIdx) }, [mode, wormIdx])

  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const query = matchMedia('(prefers-reduced-motion: reduce)')
    const changed = (event: MediaQueryListEvent) => rendererRef.current?.setReducedMotion(event.matches)
    query.addEventListener?.('change', changed)
    return () => query.removeEventListener?.('change', changed)
  }, [universeIndex, rendererAttempt])

  useEffect(() => {
    const renderer = rendererRef.current
    renderer?.setWorkspaceOpen(questionWorkspaceVisible)
    if (!questionWorkspaceVisible) return
    return () => {
      renderer?.setWorkspaceOpen(false)
    }
  }, [questionWorkspaceVisible])

  const pickConcept = useCallback((c: string) => {
    const candidate = universe?.stars.find((x) => x.c === c)
    if (!candidate) return
    const panelReturnTarget = panelFocusReturnRef.current
    const focused = rendererRef.current?.focusStar(starIdentity(candidate))
    if (!focused) return
    panelFocusReturnRef.current = panelReturnTarget
    cancelActiveProbe()
    setQuestionEntry(null)
    setPlanet(null)
    focusReturnRef.current = null
    focusCardFromLaneRef.current = false
    setStar(focused)
  }, [cancelActiveProbe, setPlanet, setQuestionEntry, setStar, universe])

  const restorePanelFocus = useCallback(() => {
    const target = panelFocusReturnRef.current
    panelFocusReturnRef.current = null
    requestAnimationFrame(() => {
      const destination = target?.isConnected ? target : canvasRef.current
      destination?.focus({ preventScroll: true })
    })
  }, [])

  const closeStarPanel = useCallback(() => {
    cancelActiveProbe()
    setStar(null)
    setPlanet(null)
    setQuestionEntry(null)
    focusReturnRef.current = null
    focusCardFromLaneRef.current = false
    rendererRef.current?.resetView()
    restorePanelFocus()
  }, [cancelActiveProbe, restorePanelFocus, setPlanet, setQuestionEntry, setStar])

  const onMode = useCallback((m: Mode, trigger: HTMLButtonElement) => {
    cancelActiveProbe()
    if (m !== 'all') panelFocusReturnRef.current = trigger
    setStar(null)
    setPlanet(null)
    setQuestionEntry(null)
    focusReturnRef.current = null
    focusCardFromLaneRef.current = false
    dispatchUi({ type: 'toggle-mode', mode: m })
  }, [cancelActiveProbe, setPlanet, setQuestionEntry, setStar])

  const onEnterQuestion = useCallback((selected: PlanetDatum) => {
    focusCardFromLaneRef.current = false
    setPlanet(null)
    // The workspace observes this same selected body; it is not a text-only route.
    setQuestionEntry(selected)
  }, [setPlanet, setQuestionEntry])

  /**
   * 焦点归还目标。
   *
   * 存的是 DOM 节点，而进入答案地层会把来路那一整块卸载掉 —— 对已经脱离文档的
   * 节点调 `.focus()` 什么也不会发生，焦点会掉回 <body>，键盘用户就此断线。
   * 所以设置时一并记住它的 `data-focus-return` 标记，节点失联时按标记找回
   * 重新挂载的那一个。两条来路（航道轨道按钮 / 面板入口按钮）各回各的。
   */
  const rememberQuestionReturn = useCallback((trigger: HTMLButtonElement | null) => {
    focusReturnRef.current = trigger
    focusReturnKeyRef.current = trigger?.getAttribute('data-focus-return') ?? null
  }, [])

  const questionReturnTarget = useCallback((): HTMLElement | null => {
    const stored = focusReturnRef.current
    if (stored?.isConnected) return stored
    const key = focusReturnKeyRef.current
    const live = key
      ? document.querySelector<HTMLButtonElement>(`[data-focus-return="${CSS.escape(key)}"]`)
      : null
    return live ?? canvasRef.current
  }, [])

  const restoreLaneFocus = useCallback(() => {
    requestAnimationFrame(() => questionReturnTarget()?.focus())
  }, [questionReturnTarget])

  const closePlanet = useCallback(() => {
    setPlanet(null)
    rendererRef.current?.clearPlanet()
    restoreLaneFocus()
  }, [restoreLaneFocus, setPlanet])

  const selectQuestionFromLane = useCallback((datum: QuestionPlanetDatum, trigger: HTMLButtonElement) => {
    const alreadySelected = planet?.question.id === datum.question.id
    rememberQuestionReturn(trigger)
    focusCardFromLaneRef.current = true
    setQuestionEntry(null)
    const selected = rendererRef.current?.selectQuestionPlanet(datum.starId, datum.question.id)
    if (!selected) {
      focusCardFromLaneRef.current = false
    } else if (alreadySelected) {
      focusCardFromLaneRef.current = false
      requestAnimationFrame(() => {
        cardRef.current?.querySelector<HTMLButtonElement>('[data-question-primary]')?.focus()
      })
    }
  }, [planet?.question.id, rememberQuestionReturn, setQuestionEntry])

  const enterQuestionFromPanel = useCallback((questionId: string, trigger: HTMLButtonElement) => {
    if (!star || !('id' in star) || typeof star.id !== 'string') return
    const selected = rendererRef.current?.selectQuestionPlanet(star.id, questionId)
    if (!selected) return
    rememberQuestionReturn(trigger)
    focusCardFromLaneRef.current = false
    setPlanet(null)
    setQuestionEntry(selected)
  }, [rememberQuestionReturn, setPlanet, setQuestionEntry, star])

  const leaveQuestionEntry = useCallback(() => {
    // 返回问题航道就是离开地表：否则宇宙一直关着、相机一直被地表占着，人被困在球上。
    rendererRef.current?.exitPlanetSurface?.()
    setQuestionEntry(null)
  }, [setQuestionEntry])

  const restoreQuestionCamera = useCallback(() => {
    if (!questionEntry || !('id' in questionEntry.star.s)) return
    rendererRef.current?.restoreQuestionPlanet(questionEntry.star.s.id, questionEntry.question.id)
  }, [questionEntry])

  const enterStrata = useCallback((questionId: string) => {
    if (!universeIndex || !questionEntry || questionEntry.question.id !== questionId || strataState) return
    const token = ++transitionTokenRef.current
    const scene = buildStrataSceneModel(universeIndex, questionId)
    setStrataScene(scene)
    setStrataPose(null)
    strataPoseReportedAtRef.current = 0
    dispatchUi({ type: 'enter-strata', questionId, token })
    rendererRef.current?.enterStrata({ token, questionId, scene })
  }, [questionEntry, strataState, universeIndex])

  /**
   * 进了行星就一路飞进大气层，落到答案地层 —— 不再要求再点一次「打开答案地层」。
   *
   * renderer.enterStrata 自己会 cancelFlight('strata') 并从当前机位起手，所以
   * 「逼近行星 → 穿过大气层 → 地层」是一条连续动画，不是两段拼接。回答少的
   * 问题也照样进去：地层会以 surface-only 开启并显示「深层已阻断」，而不是
   * 把人晾在宇宙视角。免责声明在 StrataHud 里有自己的一份，不会丢。
   *
   * 每颗行星只自动进入一次：退出地层时 questionEntry 仍在，靠这个 ref 记住
   * 已经进过，否则用户会被一直拉回地层、永远出不来。
   */
  const autoEnteredQuestionRef = useRef<string | null>(null)
  /** 是否站在行星地表上。决定工作台左边是行走 HUD 还是轨道观测台。 */
  const [surfaceLanded, setSurfaceLanded] = useState(false)
  /** 在地表上点开的旗/石堆：那条回答的证据板。 */
  const [surfaceEvidenceAnswerId, setSurfaceEvidenceAnswerId] = useState<string | null>(null)
  const pickSurface = useCallback((clientX: number, clientY: number) => {
    const picked = rendererRef.current?.pickPlanetSurface?.(clientX, clientY) ?? null
    if (!picked) return
    if (picked.kind === 'mark') {
      setSurfaceEvidenceAnswerId(picked.answerId)
    } else if (picked.kind === 'planet' || picked.kind === 'signpost') {
      // 天上的邻居 / 小径尽头的路牌：飞过去，落到它的地表上。
      const selected = rendererRef.current?.selectQuestionPlanet(picked.starId, picked.questionId)
      if (selected) {
        setPlanet(null)
        setQuestionEntry(selected)
      }
    } else {
      // 虫洞通向的星群：离开地表，切到虫洞视图。
      rendererRef.current?.exitPlanetSurface?.()
      setQuestionEntry(null)
      setPlanet(null)
      setMode('worm')
      setWormIdx(picked.wormholeIndex)
    }
  }, [setMode, setPlanet, setQuestionEntry, setWormIdx])
  useEffect(() => {
    const questionId = questionEntry?.question.id ?? null
    if (!questionId) {
      autoEnteredQuestionRef.current = null
      setSurfaceLanded(false)
      setSurfaceEvidenceAnswerId(null)
      return
    }
    if (autoEnteredQuestionRef.current === questionId) return
    autoEnteredQuestionRef.current = questionId
    // 先站到地表上。可环绕地表是 Babylon 独有能力；Three 没有 CPU 地形，
    // 拿不到这个方法时退回旧路径（直接进答案地层），而不是把人晾在轨道视角。
    const landed = rendererRef.current?.enterPlanetSurface?.(questionId, {
      nextStation: universeIndex ? nextStationAfter(universeIndex, questionId) : null,
    }) ?? false
    setSurfaceLanded(landed)
    if (!landed) enterStrata(questionId)
  }, [enterStrata, questionEntry, universeIndex])

  const moveStrata = useCallback((intent: Parameters<MindverseRenderer['moveStrata']>[0]) => {
    rendererRef.current?.moveStrata(intent)
  }, [])

  const exitStrata = useCallback(() => {
    const current = explorationRef.current
    if (current.kind !== 'surface-crossing' && current.kind !== 'strata-free'
      && current.kind !== 'strata-snapped' && current.kind !== 'answer-specimen-focus') return
    if (current.kind === 'answer-specimen-focus') rendererRef.current?.closeAnswerSpecimen()
    dispatchUi({ type: 'exit-strata' })
    rendererRef.current?.exitStrata(current.token)
  }, [])

  const closeAnswerEvidence = useCallback(() => {
    rendererRef.current?.closeAnswerSpecimen()
    dispatchUi({ type: 'close-answer-specimen' })
  }, [])

  const getQuestionReturnFocus = useCallback(
    () => questionReturnTarget(),
    [questionReturnTarget],
  )

  const panelOpen = star !== null || mode !== 'all'

  const inspectProbe = useCallback((owner: Star, probe: ArticleProbe, trigger: HTMLButtonElement) => {
    const token = ++transitionTokenRef.current
    probeCommandActiveRef.current = true
    probeCommandKindRef.current = 'approach'
    probeReturnFocusRef.current = trigger
    setSelectedProbePart(null)
    dispatchUi({ type: 'approach-probe', star: owner, probe, token })
    rendererRef.current?.approachProbe(probe.id, token)
  }, [])

  const closeProbeInspection = useCallback(() => {
    const returnTo = probeState?.returnTo
    transitionTokenRef.current += 1
    probeCommandActiveRef.current = false
    probeCommandKindRef.current = null
    rendererRef.current?.exitProbeInspection()
    if (returnTo?.kind === 'planet-focus' && 'id' in returnTo.star && typeof returnTo.star.id === 'string') {
      rendererRef.current?.restoreQuestionPlanet(returnTo.star.id, returnTo.planet.question.id)
    }
    setSelectedProbePart(null)
    dispatchUi({ type: 'exit-probe' })
    const trigger = probeReturnFocusRef.current
    probeReturnFocusRef.current = null
    requestAnimationFrame(() => (trigger?.isConnected ? trigger : canvasRef.current)?.focus({ preventScroll: true }))
  }, [probeState])

  const scanProbe = useCallback(() => {
    if (!probeState || probeState.kind !== 'probe-inspection') return
    const token = ++transitionTokenRef.current
    probeCommandKindRef.current = 'scan'
    dispatchUi({ type: 'scan-probe', token })
    rendererRef.current?.startProbeScan(probeState.probe.id, token)
  }, [probeState])

  if (seeding) {
    return <Seed onDone={() => { setSeeding(false); setError(null); setReload((n) => n + 1) }} />
  }

  if (!universe || !universeIndex) {
    return (
      <>
        <Loading stage={gen.stage} progress={gen.progress} error={error} gone={false} />
        {error && (
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: '22vh', textAlign: 'center', zIndex: 21 }}>
            <button onClick={() => { setError(null); setSeeding(true) }}>换成游客模式，现场挑几个方向</button>
          </div>
        )}
      </>
    )
  }

  const retryRenderer = () => {
    if (uiState.exploration.kind !== 'render-fallback') return
    if (uiState.exploration.recovery === 'reload') {
      location.reload()
      return
    }
    dispatchUi({ type: 'render-loading' })
    setRendererAttempt((attempt) => attempt + 1)
  }

  if (uiState.exploration.kind === 'render-fallback') {
    return (
      <div data-testid="universe-root" data-render-state={uiState.renderPhase}>
        <RenderFallback index={universeIndex} message={uiState.exploration.message}
          onRetry={retryRenderer} onSeed={() => { setSeeding(true); dispatchUi({ type: 'render-loading' }) }} />
      </div>
    )
  }

  const m = universe.meta
  const hasSpan = m.span[0] > 0 && m.span[1] > 0
  const y0 = hasSpan ? new Date(m.span[0] * 1000).getFullYear() : null
  const y1 = hasSpan ? new Date(m.span[1] * 1000).getFullYear() : null

  return (
    <div className={[questionWorkspaceVisible ? 'uv-workspace-open' : '', surfaceLanded ? 'uv-surface-open' : '', strataState ? 'uv-strata-open' : ''].filter(Boolean).join(' ') || undefined}
      data-testid="universe-root" data-render-state={uiState.renderPhase}>
      <canvas ref={canvasRef} className="uv-canvas" tabIndex={0} aria-label="认知宇宙三维星图" />
      <canvas ref={labelRef} className="uv-canvas uv-labels" />
      <div className="vignette" />
      <div className="grain" />

      <div className="uv-scrim" />

      <header className="uv-head">
        <div className="lbl">
          知乎精神宇宙
          {m.source === 'seed' && ' · 游客模式'}
          {m.source === 'mock' && ' · 示例数据'}
        </div>
        <h1>好奇心星图</h1>
        <p className="uv-sub">
          {m.source === 'seed' ? <>
            {hasSpan && <>{y0}–{y1}，</>}<b>{m.items}</b> 条公开样本内容，坍缩成 <b>{m.clusters}</b> 个方向星群。
          </> : <>
            {hasSpan && <>{y0}–{y1}，</>}<b>{m.items}</b> 条{m.source === 'mock' ? '示例收藏与创作' : '真实的知乎收藏与创作'}，坍缩成 <b>{m.clusters}</b> 个星群。
          </>}
          每一颗星都能点开，看到它由哪几条内容构成。
        </p>
      </header>

      {m.source === 'seed' && (
        <div className="uv-filtered" style={{ color: 'var(--amber)' }}>
          这是按现场选择的方向生成的公开样本宇宙，不对应任何个人知乎历史
        </div>
      )}
      {filtered > 0 && m.source !== 'seed' && (
        <div className="uv-filtered">另有 {filtered} 条内容因涉及敏感类目未参与分析</div>
      )}

      {!genesisDone && (
        <button className="uv-skip" onClick={() => { rendererRef.current?.skipGenesis(); setGenesisDone(true) }}>
          跳过 →
        </button>
      )}
      <div className="uv-hint" style={{ opacity: hint ? 1 : 0 }}>
        点恒星飞进它的星系 · 点行星查看真实问题 · 滚轮拉远逐级返回
      </div>

      {/* 仪表带：左边是「我在看什么」，中间是视图，右边是唯一的动作。
          面板打开时整条让位，不会被压在下面。 */}
      <div className={`uv-bar${panelOpen ? ' shifted' : ''}`}>
        <div className="uv-bar-in">
          {star ? (
            <nav className="uv-lad" aria-label="所在层级">
              <button onClick={closeStarPanel}>
                全景
              </button>
              <span aria-hidden="true">›</span>
              <b>{universe.clusters.find((c) => c.g === star.g)?.name}</b>
              <span aria-hidden="true">›</span>
              <b className="now">{star.c}</b>
              <span className="up">滚轮拉远逐级返回</span>
            </nav>
          ) : (
            <div className="uv-rd">
              <div className="uv-mt lead"><span className="k">条目</span><span className="v">{m.items}</span></div>
              <div className="uv-mt"><span className="k">恒星</span><span className="v">{m.concepts}</span></div>
              <div className="uv-mt"><span className="k">星群</span><span className="v">{m.clusters}</span></div>
              <div className="uv-sep" />
              {/* 琥珀只在这一格出现 */}
              <div className="uv-anom">
                <div className="uv-mt"><span className="k">虫洞</span><span className="v">{universe.wormholes.length}</span></div>
                <div className="uv-mt"><span className="k">熄灭</span><span className="v">{universe.dark.length}</span></div>
              </div>
            </div>
          )}
          <div className="uv-segw"><ModeBar mode={mode} onMode={onMode} /></div>
          <button className="uv-act" onClick={(event) => { shareReturnFocusRef.current = event.currentTarget; setSharing(true) }}>选择分享</button>
        </div>
      </div>
      <SharePreview open={sharing} universe={universe} onClose={() => setSharing(false)} getReturnFocus={() => shareReturnFocusRef.current} />
      {!strataState && star && <QuestionLane planets={questionPlanets} selectedId={planet?.question.id ?? null} onSelect={selectQuestionFromLane} />}
      {!strataState && <QuestionPlanetCard ref={cardRef} planet={planet} onEnter={onEnterQuestion}
        onClose={closePlanet} />}
      {questionWorkspaceVisible && questionEntry && (
        <QuestionWorkspaceGate index={universeIndex} questionId={questionEntry.question.id}
          orbitIndex={questionEntry.orbitIndex} shared={false} readOnly={false}
          onBack={leaveQuestionEntry} onRestoreCamera={restoreQuestionCamera}
          onOrbit={(deltaX, deltaY) => rendererRef.current?.orbitWorkspace(deltaX, deltaY)}
          stage={surfaceLanded ? 'surface' : 'orbit'}
          onWalk={(input) => { rendererRef.current?.walkPlanetSurface?.(input) }}
          provenance={questionProvenance ?? undefined}
          onSurfacePick={pickSurface}
          onEnterStrata={enterStrata} strataActive={exploration.kind === 'surface-approach'}
          getReturnFocus={getQuestionReturnFocus} />
      )}
      {!strataState && <Panel universe={universe} index={universeIndex} star={star} shared={false}
        onClose={closeStarPanel}
        highlight={undefined}
        onEnterQuestion={enterQuestionFromPanel}
        onInspectProbe={inspectProbe}
        onPickConcept={pickConcept} />}
      {probeState && probeState.kind !== 'probe-approach' && <ProbeInspectionPanel
        probe={probeState.probe} canvas={canvasRef.current}
        scanning={probeState.kind === 'probe-scanning'}
        scanComplete={probeState.scanComplete}
        scanError={probeState.kind === 'probe-inspection' ? probeState.scanError : null}
        selectedPart={selectedProbePart}
        onPoseChange={(pose) => rendererRef.current?.setProbeInspectionPose(pose)}
        onPartChange={(part) => { setSelectedProbePart(part); rendererRef.current?.focusProbePart(part) }}
        onScan={scanProbe} onClose={closeProbeInspection} />}
      {!strataState && <InfoPanel universe={universe} mode={star ? 'all' : mode} wormIdx={wormIdx}
        shared={false}
        onWorm={(index) => { setQuestionEntry(null); setPlanet(null); setWormIdx(index) }}
        onClose={() => { setQuestionEntry(null); setPlanet(null); setMode('all'); restorePanelFocus() }} />}
      {strataState && strataScene && strataState.kind !== 'surface-approach' && <StrataHud
        scene={strataScene} pose={strataPose} phase={strataState.kind}
        focusProxyRef={strataFocusProxyRef} onMove={moveStrata}
        onPick={(clientX, clientY) => rendererRef.current?.pickStrataAt(clientX, clientY)} onExit={exitStrata} />}
      {surfaceLanded && surfaceEvidenceAnswerId && universeIndex.answersById.get(surfaceEvidenceAnswerId) && <AnswerEvidencePanel
        answer={universeIndex.answersById.get(surfaceEvidenceAnswerId)!}
        onClose={() => setSurfaceEvidenceAnswerId(null)}
        // 关掉证据板要回到工作台里（标题），否则焦点掉到 body，W/S、I 这些键就都没人接了。
        getReturnFocus={() => document.getElementById('qw-title')} />}
      {strataState?.kind === 'answer-specimen-focus' && universeIndex.answersById.get(strataState.answerId) && <AnswerEvidencePanel
        answer={universeIndex.answersById.get(strataState.answerId)!}
        onClose={closeAnswerEvidence} getReturnFocus={() => strataFocusProxyRef.current} />}
    </div>
  )
}
