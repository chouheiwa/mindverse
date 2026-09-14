import { useEffect, useId, useRef, type RefObject } from 'react'
import type { StrataSceneModel } from '../domain/strata'
import type { StrataMoveIntent, StrataPose } from '../starmap/rendererContract'
import type { AnswerSatellite } from '../types'
import './StrataHud.css'

export interface StrataHudProps {
  scene: StrataSceneModel
  questionTitle?: string
  answers?: ReadonlyMap<string, AnswerSatellite>
  onReadAnswer?: (answerId: string) => void
  pose: StrataPose | null
  phase: 'surface-crossing' | 'strata-free' | 'strata-snapped' | 'answer-specimen-focus' | 'strata-exiting'
  focusProxyRef?: RefObject<HTMLButtonElement | null>
  onMove: (intent: StrataMoveIntent) => void
  onPick: (clientX: number, clientY: number) => void
  onExit: () => void
}

const EMPTY_INTENT: StrataMoveIntent = { forward: 0, yaw: 0, pitch: 0 }

export function StrataHud({ scene, pose, phase, focusProxyRef, onMove, onPick, onExit, questionTitle, answers, onReadAnswer }: StrataHudProps) {
  const keysRef = useRef(new Set<string>())
  const touchRef = useRef<{ pointerId: number; x: number; y: number; moved: number } | null>(null)
  const clipId = useId()
  const activeLayer = scene.strata.find(({ id, centerDepth, thickness }) =>
    id === pose?.snapId || (pose && pose.depth >= centerDepth - thickness / 2 && pose.depth <= centerDepth + thickness / 2))
  const visibleSpecimens = activeLayer?.specimens ?? scene.surfaceSpecimens
  const progress = depthProgress(scene, pose)
  const layerIndex = activeLayer ? scene.strata.indexOf(activeLayer) + 1 : 0
  const interactionDisabled = phase === 'surface-crossing' || phase === 'strata-exiting' || phase === 'answer-specimen-focus'

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (interactionDisabled) {
        keysRef.current.clear()
        return
      }
      const keys = keysRef.current
      const intent = {
        forward: axis(keys, ['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp']),
        yaw: axis(keys, ['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft']),
        pitch: axis(keys, ['KeyE'], ['KeyQ']),
      }
      if (intent.forward || intent.yaw || intent.pitch) onMove(intent)
    }, 50)
    return () => window.clearInterval(interval)
  }, [interactionDisabled, onMove])

  return (
    <section className="strata-hud" aria-label="答案地层导航"
      tabIndex={0}
      onKeyDown={(event) => {
        if (isMovementKey(event.code)) { event.preventDefault(); keysRef.current.add(event.code) }
      }}
      onKeyUp={(event) => { keysRef.current.delete(event.code) }}
      onBlur={() => keysRef.current.clear()}
      onWheel={(event) => {
        if (interactionDisabled) return
        event.preventDefault()
        onMove({ ...EMPTY_INTENT, forward: event.deltaY > 0 ? 1 : -1 })
      }}
      onPointerDown={(event) => {
        if (interactionDisabled) return
        if (isInteractivePointerTarget(event.target)) return
        touchRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: 0 }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }}
      onPointerMove={(event) => {
        const previous = touchRef.current
        if (!previous || previous.pointerId !== event.pointerId || interactionDisabled) return
        onMove({
          forward: 0,
          yaw: clamp((event.clientX - previous.x) / 36),
          pitch: clamp((event.clientY - previous.y) / 36),
        })
        touchRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: previous.moved + Math.hypot(event.clientX - previous.x, event.clientY - previous.y),
        }
      }}
      onPointerUp={(event) => {
        const gesture = touchRef.current
        if (gesture?.pointerId === event.pointerId) {
          if (gesture.moved <= 6 && !interactionDisabled) onPick(event.clientX, event.clientY)
          touchRef.current = null
        }
        event.currentTarget.releasePointerCapture?.(event.pointerId)
      }}
      onPointerCancel={() => { touchRef.current = null }}>
      <div className="strata-touch-pad" aria-hidden="true" />
      <header>
        <div><span>问题行星 / 内部探索</span><h1>{questionTitle ?? '这颗问题行星'}</h1><b>{phaseLabel(phase)}</b></div>
        <button ref={focusProxyRef} type="button" onClick={onExit} disabled={phase === 'surface-crossing' || phase === 'strata-exiting'}>
          {phase === 'strata-exiting' ? '正在返回地表' : '返回行星表面'}
        </button>
      </header>
      <aside className="strata-depth" aria-label="星球内部位置" onWheel={(event) => event.stopPropagation()}>
        <span>你在这颗星球内部</span>
        <svg viewBox="0 0 160 160" role="img" aria-label={`星球剖面，${activeLayer ? `第 ${layerIndex} 层` : '浅层'}`}>
          <defs><clipPath id={clipId}><circle cx="80" cy="80" r="66" /></clipPath></defs>
          <circle className="strata-globe-rim" cx="80" cy="80" r="72" />
          <g clipPath={`url(#${clipId})`}>
            <circle className="strata-globe" cx="80" cy="80" r="66" />
            {scene.strata.map((layer) => {
              const y = 14 + (layer.centerDepth - layer.thickness / 2) / scene.bounds.bottom * 132
              const height = layer.thickness / scene.bounds.bottom * 132
              return <rect key={layer.id} x="14" y={y} width="132" height={height}
                className={layer.id === activeLayer?.id ? 'strata-slice is-current' : 'strata-slice'} />
            })}
            <path className="strata-descent-line" d="M80 14V146" />
            <circle className="strata-you" cx="80" cy={14 + progress * 1.32} r="5" />
          </g>
        </svg>
        <b>{scene.evidenceLevel === 'retrospective' ? '浅层较新 · 深层较早' : '当前只有浅层回答'}</b>
        <ol className="strata-layer-key">
          {scene.strata.map((layer) => <li key={layer.id} aria-current={layer.id === activeLayer?.id ? 'step' : undefined}>
            <span>{layerLabel(layer.startPublishedAt, layer.endPublishedAt)}</span><small>{layer.specimens.length} 条</small>
          </li>)}
        </ol>
        <div className="strata-travel" aria-label="下潜控制">
          <button type="button" disabled={interactionDisabled}
            onPointerDown={() => keysRef.current.add('KeyW')} onPointerUp={() => keysRef.current.delete('KeyW')}
            onPointerLeave={() => keysRef.current.delete('KeyW')} onPointerCancel={() => keysRef.current.delete('KeyW')}
            onClick={() => onMove({ ...EMPTY_INTENT, forward: -1 })}>↑ 上浮</button>
          <button type="button" disabled={interactionDisabled}
            onPointerDown={() => keysRef.current.add('KeyS')} onPointerUp={() => keysRef.current.delete('KeyS')}
            onPointerLeave={() => keysRef.current.delete('KeyS')} onPointerCancel={() => keysRef.current.delete('KeyS')}
            onClick={() => onMove({ ...EMPTY_INTENT, forward: 1 })}>↓ 下潜</button>
        </div>
      </aside>
      <aside className="strata-status" aria-label="当前岩层的回答" onWheel={(event) => event.stopPropagation()}>
        <div role="status">
          <span>{scene.evidenceLevel === 'retrospective' ? `回溯地层 · 第 ${layerIndex || 1} / ${scene.strata.length} 层` : '当前可观测表层'}</span>
          <h2>{activeLayer ? layerLabel(activeLayer.startPublishedAt, activeLayer.endPublishedAt) : '从这里开始读回答'}</h2>
          <p>{scene.evidenceLevel === 'retrospective'
            ? '每层收录同一时期首发的回答。点击洞壁上的发光晶体，看看当时写下了什么。'
            : '回答数量或时间信息暂不足以划分年代。这里仍可探索和阅读已收录的回答。'}</p>
        </div>
        {visibleSpecimens.slice(0, 2).map(({ answerId }) => {
          const answer = answers?.get(answerId)
          return answer && onReadAnswer ? <button type="button" className="strata-answer-preview" key={answerId}
            disabled={interactionDisabled} onClick={() => onReadAnswer(answerId)}>
            <span>{answer.authorName || '作者未标注'}</span>
            <b>{answer.summary || answer.title}</b>
            <small>定位晶体并阅读 ↗</small>
          </button> : null
        })}
        {scene.undated.length > 0 && <p className="strata-undated">侧洞另有 {scene.undated.length} 条首发时间未知的回答。</p>}
      </aside>
      <p className="strata-instructions">滚轮 / S 下潜 · W 上浮 · 拖动环视 · 点击发光晶体读回答</p>
      <p className="strata-disclaimer">{scene.disclaimer}</p>
    </section>
  )
}

function axis(keys: ReadonlySet<string>, positive: readonly string[], negative: readonly string[]): number {
  return Number(positive.some((key) => keys.has(key))) - Number(negative.some((key) => keys.has(key)))
}
const isMovementKey = (code: string): boolean => ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)
const clamp = (value: number): number => Math.max(-1, Math.min(1, value))
const isInteractivePointerTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && Boolean(target.closest('button, a, input, select, textarea, [role="button"]'))

function depthProgress(scene: StrataSceneModel, pose: StrataPose | null): number {
  if (!pose) return 0
  const bottom = scene.evidenceLevel === 'surface-only' ? 5 : Math.max(1, scene.bounds.bottom)
  return Math.max(0, Math.min(100, pose.depth / bottom * 100))
}

function phaseLabel(phase: StrataHudProps['phase']): string {
  if (phase === 'surface-crossing') return '正在穿越地表'
  if (phase === 'strata-snapped') return '已抵达这一时期的岩层'
  if (phase === 'answer-specimen-focus') return '正在阅读晶体中的回答'
  if (phase === 'strata-exiting') return '正在上浮'
  return '沿岩层探索这个问题的回答'
}

function layerLabel(start: number, end: number): string {
  const first = new Date(start * 1000).getUTCFullYear()
  const last = new Date(end * 1000).getUTCFullYear()
  return first === last ? `${first} 年` : `${first}–${last} 年`
}
