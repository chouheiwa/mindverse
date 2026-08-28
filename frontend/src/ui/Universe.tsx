import { useCallback, useEffect, useRef, useState } from 'react'
import type { Generation, Mode, Star, Universe as U } from '../types'
import { getShare, pollUntilDone, shareIdFromPath } from '../api'
import { Renderer } from '../starmap/Renderer'
import { Loading } from './Loading'
import { Panel } from './Panel'
import { InfoPanel } from './InfoPanel'
import { ModeBar } from './ModeBar'
import { Card } from './Card'
import { PlanetCard } from './PlanetCard'
import type { PlanetDatum } from '../starmap/gl/bodies'
import { Seed } from './Seed'
import './Universe.css'

const reduceMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function UniverseView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // 标签单独一层 2D 画布：文字该用文字渲染器画，也不该被 bloom 糊掉
  const labelRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<Renderer | null>(null)

  const [gen, setGen] = useState<Pick<Generation, 'stage' | 'progress'>>({
    stage: '正在读取你的知乎足迹', progress: 6,
  })
  const [universe, setUniverse] = useState<U | null>(null)
  const [filtered, setFiltered] = useState(0)
  const [shared, setShared] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [star, setStar] = useState<Star | null>(null)
  const [planet, setPlanet] = useState<PlanetDatum | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>('all')
  const [wormIdx, setWormIdx] = useState(0)
  const [genesisDone, setGenesisDone] = useState(reduceMotion())
  const [hint, setHint] = useState(false)
  const [card, setCard] = useState(false)
  // 显式进入游客模式，或生成失败后由用户选择改走种子星
  const [seeding, setSeeding] = useState(
    () => new URLSearchParams(location.search).get('seed') === '1',
  )
  const [reload, setReload] = useState(0)

  // 取数据：分享页读快照，否则轮询生成
  useEffect(() => {
    if (seeding) return
    const ac = new AbortController()
    const id = shareIdFromPath()
    ;(async () => {
      try {
        if (id) {
          setShared(true)
          setGen({ stage: '正在打开这张星图', progress: 40 })
          const snap = await getShare(id)
          setUniverse(snap.universe)
          return
        }
        const g = await pollUntilDone((p) => setGen({ stage: p.stage, progress: p.progress }), ac.signal)
        setUniverse(g.universe!)
        setFiltered(g.filtered)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => ac.abort()
  }, [seeding, reload])

  // 挂渲染器：canvas 由它独占，不随 React 重渲染
  useEffect(() => {
    if (!universe || !canvasRef.current || !labelRef.current) return
    const r = new Renderer(canvasRef.current, labelRef.current, universe, reduceMotion(), {
      onPick: (s) => { setStar(s); if (s) setMode('all') },
      onPickPlanet: setPlanet,
      // 命令式定位：行星一直在动，这里每帧都会被调用
      onAnchor: (x, y, visible) => {
        const el = cardRef.current
        if (!el) return
        el.style.visibility = visible ? 'visible' : 'hidden'
        // 贴边时把卡片收回视口内
        const w = el.offsetWidth || 274
        const cx = Math.min(Math.max(x, w / 2 + 12), innerWidth - w / 2 - 12)
        // 行星靠近顶部时卡片翻到它下面，否则会盖住标题
        const below = y < (el.offsetHeight || 130) + 40
        el.classList.toggle('below', below)
        el.style.transform = below
          ? `translate(-50%, 0) translate(${cx}px, ${y + 20}px)`
          : `translate(-50%, -100%) translate(${cx}px, ${y - 16}px)`
      },
      onGenesisEnd: () => {
        setGenesisDone(true)
        setHint(true)
        setTimeout(() => setHint(false), 6000)
      },
    })
    rendererRef.current = r
    r.start()
    const onResize = () => r.resize()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      r.destroy()
      rendererRef.current = null
    }
  }, [universe])

  useEffect(() => { rendererRef.current?.setMode(mode, wormIdx) }, [mode, wormIdx])

  const pickConcept = useCallback((c: string) => {
    const s = universe?.stars.find((x) => x.c === c)
    if (s) setStar(s)
  }, [universe])

  const onMode = useCallback((m: Mode) => {
    setStar(null)
    setPlanet(null)
    setMode((cur) => (cur === m && m !== 'all' ? 'all' : m))
  }, [])

  const panelOpen = star !== null || mode !== 'all'

  if (seeding) {
    return <Seed onDone={() => { setSeeding(false); setError(null); setReload((n) => n + 1) }} />
  }

  if (!universe) {
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
  const y0 = new Date(m.span[0] * 1000).getFullYear()
  const y1 = new Date(m.span[1] * 1000).getFullYear()

  return (
    <>
      <canvas ref={canvasRef} className="uv-canvas" />
      <canvas ref={labelRef} className="uv-canvas uv-labels" />
      <div className="vignette" />
      <div className="grain" />

      <div className="uv-scrim" />

      <header className="uv-head">
        <div className="lbl">
          知乎精神宇宙{shared ? ' · 他人分享' : ''}
          {m.source === 'seed' && ' · 游客模式'}
          {m.source === 'mock' && ' · 示例数据'}
        </div>
        <h1>好奇心星图</h1>
        <p className="uv-sub">
          {y0}–{y1}，<b>{m.items}</b> 条真实的知乎收藏与创作，坍缩成 <b>{m.clusters}</b> 个星群。
          每一颗星都能点开，看到它由哪几条内容构成。
        </p>
      </header>

      {m.source === 'seed' && (
        <div className="uv-filtered" style={{ color: 'var(--amber)' }}>
          这是按你现场挑选的方向生成的宇宙，不是你的知乎历史
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
        点恒星飞进它的星系 · 点行星看那条内容 · 滚轮拉远逐级返回
      </div>

      {/* 仪表带：左边是「我在看什么」，中间是视图，右边是唯一的动作。
          面板打开时整条让位，不会被压在下面。 */}
      <div className={`uv-bar${panelOpen ? ' shifted' : ''}`}>
        <div className="uv-bar-in">
          {star ? (
            <nav className="uv-lad" aria-label="所在层级">
              <button onClick={() => { setStar(null); setPlanet(null); rendererRef.current?.resetView() }}>
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
                <div className="uv-mt"><span className="k">暗物质</span><span className="v">{universe.dark.length}</span></div>
              </div>
            </div>
          )}
          <div className="uv-segw"><ModeBar mode={mode} onMode={onMode} /></div>
          <button className="uv-act" onClick={() => setCard(true)}>宇宙身份证</button>
        </div>
      </div>
      {card && <Card universe={universe} canShare={!shared} onClose={() => setCard(false)} />}
      <PlanetCard ref={cardRef} planet={planet} shared={shared}
        onClose={() => { setPlanet(null); rendererRef.current?.clearPlanet() }} />
      <Panel universe={universe} star={star} shared={shared}
        onClose={() => { setStar(null); setPlanet(null); rendererRef.current?.resetView() }}
        highlight={planet?.ev.u}
        onPickConcept={pickConcept} />
      <InfoPanel universe={universe} mode={star ? 'all' : mode} wormIdx={wormIdx}
        shared={shared} onWorm={setWormIdx} onClose={() => setMode('all')} />
    </>
  )
}
