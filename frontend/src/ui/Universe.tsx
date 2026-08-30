import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Generation, Mode, Star, Universe as U } from '../types'
import { pollUntilDone } from '../api'
import type { Renderer } from '../starmap/Renderer'
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
import './Universe.css'

const reduceMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function UniverseView() {
  return <PrivateUniverseView />
}

export function PrivateUniverseView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 标签单独一层 2D 画布：文字该用文字渲染器画，也不该被 bloom 糊掉
  const labelRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)

  const [gen, setGen] = useState<Pick<Generation, 'stage' | 'progress'>>({
    stage: '正在读取你的知乎足迹', progress: 6,
  })
  const [universe, setUniverse] = useState<U | null>(null)
  const [filtered, setFiltered] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [star, setStar] = useState<Star | null>(null)
  const [planet, setPlanet] = useState<PlanetDatum | null>(null)
  const [questionEntry, setQuestionEntry] = useState<PlanetDatum | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const cardSizeRef = useRef({ width: 332, height: 180 })
  const focusReturnRef = useRef<HTMLButtonElement | null>(null)
  const panelFocusReturnRef = useRef<HTMLElement | null>(null)
  const focusCardFromLaneRef = useRef(false)
  const [mode, setMode] = useState<Mode>('all')
  const [wormIdx, setWormIdx] = useState(0)
  const [genesisDone, setGenesisDone] = useState(reduceMotion())
  const [hint, setHint] = useState(false)
  const [sharing, setSharing] = useState(false)
  const shareReturnFocusRef = useRef<HTMLButtonElement | null>(null)
  // 显式进入游客模式，或生成失败后由用户选择改走种子星
  const [seeding, setSeeding] = useState(
    () => new URLSearchParams(location.search).get('seed') === '1',
  )
  const [reload, setReload] = useState(0)
  const universeIndex = useMemo(() => universe ? indexUniverse(universe) : null, [universe])
  const questionPlanets = useMemo(
    () => universeIndex && star ? selectPlanetData(universeIndex, star) : [],
    [universeIndex, star],
  )

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
    let instance: Renderer | null = null
    let hintTimer: ReturnType<typeof setTimeout> | null = null
    const mountRenderer = async () => {
      const { Renderer: WebGLRenderer } = await import('../starmap/Renderer')
      if (disposed) return
      const r = new WebGLRenderer(canvas, labels, universeIndex, reduceMotion(), {
      onPick: (s) => {
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
    }
    const onResize = () => instance?.resize()
    void mountRenderer().catch((cause: unknown) => {
      if (!disposed) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => {
      disposed = true
      window.removeEventListener('resize', onResize)
      instance?.destroy()
      if (hintTimer !== null) clearTimeout(hintTimer)
      if (rendererRef.current === instance) rendererRef.current = null
    }
    // Renderer lifecycle follows the immutable universe index. Current mode is applied on mount
    // and subsequent changes flow through the dedicated effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universeIndex])

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
    const renderer = rendererRef.current
    renderer?.setWorkspaceOpen(questionEntry !== null)
    if (!questionEntry) return
    renderer?.suspend()
    return () => {
      renderer?.setWorkspaceOpen(false)
      renderer?.resume()
    }
  }, [questionEntry])

  const pickConcept = useCallback((c: string) => {
    const s = universe?.stars.find((x) => x.c === c)
    if (s) {
      setQuestionEntry(null)
      setPlanet(null)
      focusReturnRef.current = null
      focusCardFromLaneRef.current = false
      rendererRef.current?.clearPlanet()
      setStar(s)
    }
  }, [universe])

  const restorePanelFocus = useCallback(() => {
    const target = panelFocusReturnRef.current
    panelFocusReturnRef.current = null
    requestAnimationFrame(() => {
      const destination = target?.isConnected ? target : canvasRef.current
      destination?.focus({ preventScroll: true })
    })
  }, [])

  const closeStarPanel = useCallback(() => {
    setStar(null)
    setPlanet(null)
    setQuestionEntry(null)
    focusReturnRef.current = null
    focusCardFromLaneRef.current = false
    rendererRef.current?.resetView()
    restorePanelFocus()
  }, [restorePanelFocus])

  const onMode = useCallback((m: Mode, trigger: HTMLButtonElement) => {
    if (m !== 'all') panelFocusReturnRef.current = trigger
    setStar(null)
    setPlanet(null)
    setQuestionEntry(null)
    focusReturnRef.current = null
    focusCardFromLaneRef.current = false
    setMode((cur) => (cur === m && m !== 'all' ? 'all' : m))
  }, [])

  const onEnterQuestion = useCallback((selected: PlanetDatum) => {
    focusCardFromLaneRef.current = false
    setPlanet(null)
    rendererRef.current?.clearPlanet()
    // clearPlanet synchronously emits onPickPlanet(null); write entry last.
    setQuestionEntry(selected)
  }, [])

  const restoreLaneFocus = useCallback(() => {
    requestAnimationFrame(() => (focusReturnRef.current ?? canvasRef.current)?.focus())
  }, [])

  const closePlanet = useCallback(() => {
    setPlanet(null)
    rendererRef.current?.clearPlanet()
    restoreLaneFocus()
  }, [restoreLaneFocus])

  const selectQuestionFromLane = useCallback((datum: QuestionPlanetDatum, trigger: HTMLButtonElement) => {
    const alreadySelected = planet?.question.id === datum.question.id
    focusReturnRef.current = trigger
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
  }, [planet?.question.id])

  const enterQuestionFromPanel = useCallback((questionId: string, trigger: HTMLButtonElement) => {
    if (!star || !('id' in star)) return
    const selected = rendererRef.current?.selectQuestionPlanet(star.id, questionId)
    if (!selected) return
    focusReturnRef.current = trigger
    focusCardFromLaneRef.current = false
    setPlanet(null)
    rendererRef.current?.clearPlanet()
    setQuestionEntry(selected)
  }, [star])

  const leaveQuestionEntry = useCallback(() => {
    setQuestionEntry(null)
  }, [])

  const restoreQuestionCamera = useCallback(() => {
    if (!questionEntry || !('id' in questionEntry.star.s)) return
    rendererRef.current?.restoreQuestionPlanet(questionEntry.star.s.id, questionEntry.question.id)
  }, [questionEntry])

  const getQuestionReturnFocus = useCallback(
    () => focusReturnRef.current ?? canvasRef.current,
    [],
  )

  const panelOpen = star !== null || mode !== 'all'

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

  const m = universe.meta
  const hasSpan = m.span[0] > 0 && m.span[1] > 0
  const y0 = hasSpan ? new Date(m.span[0] * 1000).getFullYear() : null
  const y1 = hasSpan ? new Date(m.span[1] * 1000).getFullYear() : null

  return (
    <>
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
      {star && <QuestionLane planets={questionPlanets} selectedId={planet?.question.id ?? null} onSelect={selectQuestionFromLane} />}
      <QuestionPlanetCard ref={cardRef} planet={planet} onEnter={onEnterQuestion}
        onClose={closePlanet} />
      {questionEntry && (
        <QuestionWorkspaceGate index={universeIndex} questionId={questionEntry.question.id}
          orbitIndex={questionEntry.orbitIndex} shared={false} readOnly={false}
          onBack={leaveQuestionEntry} onRestoreCamera={restoreQuestionCamera}
          getReturnFocus={getQuestionReturnFocus} />
      )}
      <Panel universe={universe} index={universeIndex} star={star} shared={false}
        onClose={closeStarPanel}
        highlight={undefined}
        onEnterQuestion={enterQuestionFromPanel}
        onPickConcept={pickConcept} />
      <InfoPanel universe={universe} mode={star ? 'all' : mode} wormIdx={wormIdx}
        shared={false}
        onWorm={(index) => { setQuestionEntry(null); setPlanet(null); setWormIdx(index) }}
        onClose={() => { setQuestionEntry(null); setPlanet(null); setMode('all'); restorePanelFocus() }} />
    </>
  )
}
