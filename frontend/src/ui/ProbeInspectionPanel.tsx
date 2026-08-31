import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ProbePart } from '../starmap/gl/probe'
import { ProbeInspectionController, type InspectionPose, type NormalizedPointer } from '../starmap/probeInspection'
import type { ArticleProbe } from '../types'
import './ProbeInspectionPanel.css'

interface Props {
  probe: ArticleProbe; canvas: HTMLCanvasElement | null; scanning: boolean; scanComplete: boolean
  selectedPart: ProbePart | null; onPoseChange: (pose: InspectionPose) => void
  onPartChange: (part: ProbePart | null) => void; onScan: () => void; onClose: () => void
}

const PARTS: readonly [ProbePart, string][] = [
  ['hull', '主舱'], ['left-wing', '左翼'], ['right-wing', '右翼'], ['beacon', '信标'],
  ['antenna', '天线'], ['thruster', '推进器'], ['left-hinge', '左铰链'], ['right-hinge', '右铰链'],
  ['seam', '舱体接缝'], ['scanner-lens', '扫描镜头'], ['light-strip-inner', '内灯带'], ['etching', '铭纹'],
]
const CAMERA_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-', '='])

export function ProbeInspectionPanel({ probe, canvas, scanning, scanComplete, selectedPart,
  onPoseChange, onPartChange, onScan, onClose }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [controller] = useState(() => new ProbeInspectionController())
  const callbacksRef = useRef({ onPoseChange, onClose })
  useEffect(() => { callbacksRef.current = { onPoseChange, onClose } }, [onClose, onPoseChange])
  useLayoutEffect(() => { titleRef.current?.focus({ preventScroll: true }) }, [probe.id])
  useEffect(() => {
    emitReset()
    const pointers = new Map<number, NormalizedPointer>()
    const emit = (pose: InspectionPose) => callbacksRef.current.onPoseChange(pose)
    const snapshot = () => [...pointers.values()]
    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 2) return
      pointers.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY, button: event.button })
      canvas?.setPointerCapture?.(event.pointerId)
      emit(controller.pointer({ type: 'start', pointers: snapshot() }))
    }
    const move = (event: PointerEvent) => {
      const previous = pointers.get(event.pointerId)
      if (!previous) return
      pointers.set(event.pointerId, { ...previous, x: event.clientX, y: event.clientY })
      emit(controller.pointer({ type: 'move', pointers: snapshot() }))
    }
    const end = (event: PointerEvent) => {
      pointers.delete(event.pointerId)
      if (canvas?.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      emit(controller.pointer({ type: 'end', pointers: snapshot() }))
    }
    const cancel = () => { pointers.clear(); emit(controller.pointer({ type: 'cancel' })) }
    const wheel = (event: WheelEvent) => { event.preventDefault(); emit(controller.zoom(event.deltaY)) }
    const context = (event: Event) => event.preventDefault()
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); callbacksRef.current.onClose(); return }
      if (!CAMERA_KEYS.has(event.key)) return
      event.preventDefault()
      const key = event.key === '=' ? '+' : event.key
      emit(controller.keyboard(key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | '+' | '-'))
    }
    canvas?.addEventListener('pointerdown', down); canvas?.addEventListener('pointermove', move)
    canvas?.addEventListener('pointerup', end); canvas?.addEventListener('pointercancel', cancel)
    canvas?.addEventListener('lostpointercapture', cancel); canvas?.addEventListener('wheel', wheel, { passive: false })
    canvas?.addEventListener('contextmenu', context); window.addEventListener('keydown', keyboard)
    return () => {
      canvas?.removeEventListener('pointerdown', down); canvas?.removeEventListener('pointermove', move)
      canvas?.removeEventListener('pointerup', end); canvas?.removeEventListener('pointercancel', cancel)
      canvas?.removeEventListener('lostpointercapture', cancel); canvas?.removeEventListener('wheel', wheel)
      canvas?.removeEventListener('contextmenu', context); window.removeEventListener('keydown', keyboard)
    }
    function emitReset() { callbacksRef.current.onPoseChange(controller.reset()) }
  }, [canvas, controller, probe.id])

  const apply = (operation: (controller: ProbeInspectionController) => InspectionPose) => {
    onPoseChange(operation(controller))
  }
  return <aside className="probe-inspection" aria-labelledby="probe-inspection-title">
    <header>
      <p className="probe-inspection-kicker">文章探测器 · 近景检查</p>
      <h2 id="probe-inspection-title" ref={titleRef} tabIndex={-1}>检查探测器：{probe.title}</h2>
      <button type="button" className="probe-inspection-close" aria-label="关闭探测器检查" onClick={onClose}>×</button>
    </header>
    <p className="probe-inspection-help">拖动旋转，右键拖动平移，双指缩放并平移。也可使用下方按钮或方向键与 +/-。</p>
    <div className="probe-inspection-controls" role="group" aria-label="探测器视角控制">
      <button type="button" aria-label="向左旋转" onClick={() => apply((c) => c.rotate(-12, 0))}>← 旋转</button>
      <button type="button" aria-label="向右旋转" onClick={() => apply((c) => c.rotate(12, 0))}>旋转 →</button>
      <button type="button" aria-label="向上旋转" onClick={() => apply((c) => c.rotate(0, -12))}>↑ 旋转</button>
      <button type="button" aria-label="向下旋转" onClick={() => apply((c) => c.rotate(0, 12))}>↓ 旋转</button>
      <button type="button" aria-label="放大" onClick={() => apply((c) => c.zoom(-60))}>+放大</button>
      <button type="button" aria-label="缩小" onClick={() => apply((c) => c.zoom(60))}>−缩小</button>
      <button type="button" aria-label="向左平移" onClick={() => apply((c) => c.pan(-20, 0))}>← 平移</button>
      <button type="button" aria-label="向右平移" onClick={() => apply((c) => c.pan(20, 0))}>平移 →</button>
      <button type="button" aria-label="归位" onClick={() => apply((c) => c.reset())}>归位</button>
    </div>
    <section aria-labelledby="probe-parts-title"><h3 id="probe-parts-title">部件检查</h3>
      <div className="probe-part-controls">{PARTS.map(([part, label]) => <button type="button" key={part}
        aria-label={`聚焦部件：${label}`} aria-pressed={selectedPart === part}
        onClick={() => onPartChange(selectedPart === part ? null : part)}>{label}</button>)}</div>
    </section>
    <div className="probe-scan-actions">
      <button type="button" disabled={scanning} onClick={onScan}>{scanning ? '正在扫描…' : scanComplete ? '重新扫描' : '开始扫描'}</button>
      {scanComplete && <a href={probe.url} target="_blank" rel="noopener noreferrer">查看原文章</a>}
    </div>
    <p className="probe-scan-status" role="status" aria-live="polite">
      {scanning ? '正在扫描当前探测器。' : scanComplete ? '扫描完成，已开放当前文章链接。' : '尚未开始扫描。'}
    </p>
  </aside>
}
