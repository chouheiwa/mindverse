import { useEffect, useRef, type RefObject } from 'react'
import type { StrataSceneModel } from '../domain/strata'
import type { StrataMoveIntent, StrataPose } from '../starmap/rendererContract'
import './StrataHud.css'

export interface StrataHudProps {
  scene: StrataSceneModel
  pose: StrataPose | null
  phase: 'surface-crossing' | 'strata-free' | 'strata-snapped' | 'answer-specimen-focus' | 'strata-exiting'
  focusProxyRef?: RefObject<HTMLButtonElement | null>
  onMove: (intent: StrataMoveIntent) => void
  onPick: (clientX: number, clientY: number) => void
  onExit: () => void
}

const EMPTY_INTENT: StrataMoveIntent = { forward: 0, yaw: 0, pitch: 0 }

export function StrataHud({ scene, pose, phase, focusProxyRef, onMove, onPick, onExit }: StrataHudProps) {
  const keysRef = useRef(new Set<string>())
  const touchRef = useRef<{ pointerId: number; x: number; y: number; moved: number } | null>(null)
  const activeLayer = pose?.snapId ? scene.strata.find(({ id }) => id === pose.snapId) : null
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
        <div><span>ANSWER STRATA</span><b>{phaseLabel(phase)}</b></div>
        <button type="button" onClick={onExit} disabled={phase === 'surface-crossing' || phase === 'strata-exiting'}>
          {phase === 'strata-exiting' ? '正在返回地表' : '返回行星表面'}
        </button>
      </header>
      <div className="strata-depth">
        <span>DEPTH</span>
        <strong>{pose ? pose.depth.toFixed(1) : '—'}<small> m</small></strong>
        <i style={{ '--strata-progress': `${depthProgress(scene, pose)}%` } as React.CSSProperties} />
      </div>
      <div className="strata-status" role="status">
        <b>{scene.evidenceLevel === 'retrospective' ? '回溯地层' : '当前可观测表层'}</b>
        <span>{activeLayer ? layerLabel(activeLayer.startPublishedAt, activeLayer.endPublishedAt)
          : scene.evidenceLevel === 'surface-only' ? '深层已阻断 · 不生成年代含义' : '自由下潜 · 接近层心自动吸附'}</span>
      </div>
      <p className="strata-instructions">W/S 或滚轮下潜 · A/D 转向 · Q/E 俯仰 · 触控拖动观察</p>
      <p className="strata-disclaimer">{scene.disclaimer}</p>
      <button ref={focusProxyRef} type="button" className="strata-focus-proxy">答案标本交互焦点</button>
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
  if (phase === 'strata-snapped') return '地层吸附'
  if (phase === 'answer-specimen-focus') return '答案标本聚焦'
  if (phase === 'strata-exiting') return '正在上浮'
  return '洞窟自由探索'
}

function layerLabel(start: number, end: number): string {
  return `${new Date(start * 1000).getUTCFullYear()}–${new Date(end * 1000).getUTCFullYear()} · 当前可访问版本`
}
