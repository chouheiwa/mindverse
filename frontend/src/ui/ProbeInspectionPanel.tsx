import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ProbePart } from '../starmap/gl/probe'
import { ProbeInspectionController, type InspectionPose, type NormalizedPointer } from '../starmap/probeInspection'
import type { ArticleProbe } from '../types'
import './ProbeInspectionPanel.css'

interface Props {
  probe: ArticleProbe; canvas: HTMLCanvasElement | null; scanning: boolean; scanComplete: boolean; scanError: string | null
  selectedPart: ProbePart | null; onPoseChange: (pose: InspectionPose) => void
  onPartChange: (part: ProbePart | null) => void; onScan: () => void; onClose: () => void
}

const PARTS: readonly [ProbePart, string][] = [
  ['hull', '主舱'], ['left-wing', '左翼'], ['right-wing', '右翼'], ['beacon', '信标'],
  ['antenna', '天线'], ['thruster', '推进器'], ['left-hinge', '左铰链'], ['right-hinge', '右铰链'],
  ['seam', '舱体接缝'], ['scanner-lens', '扫描镜头'], ['light-strip-inner', '内灯带'], ['etching', '铭纹'],
]
const CAMERA_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-', '='])

export function ProbeInspectionPanel({ probe, canvas, scanning, scanComplete, scanError, selectedPart,
  onPoseChange, onPartChange, onScan, onClose }: Props) {
  const dialogRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [controller] = useState(() => new ProbeInspectionController())
  const callbacksRef = useRef({ onPoseChange, onClose })
  useEffect(() => { callbacksRef.current = { onPoseChange, onClose } }, [onClose, onPoseChange])
  useLayoutEffect(() => { titleRef.current?.focus({ preventScroll: true }) }, [probe.id, scanning])
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const restored: Array<() => void> = []
    let branch: HTMLElement = dialog
    while (branch.parentElement) {
      const parent = branch.parentElement
      for (const sibling of Array.from(parent.children)) {
        if (!(sibling instanceof HTMLElement) || sibling === branch) continue
        if (sibling === canvas) {
          const ariaHidden = sibling.getAttribute('aria-hidden')
          const tabIndex = sibling.getAttribute('tabindex')
          sibling.setAttribute('aria-hidden', 'true')
          sibling.setAttribute('tabindex', '-1')
          restored.push(() => {
            if (ariaHidden === null) sibling.removeAttribute('aria-hidden'); else sibling.setAttribute('aria-hidden', ariaHidden)
            if (tabIndex === null) sibling.removeAttribute('tabindex'); else sibling.setAttribute('tabindex', tabIndex)
          })
        } else {
          const inert = sibling.hasAttribute('inert')
          const ariaHidden = sibling.getAttribute('aria-hidden')
          sibling.setAttribute('inert', '')
          sibling.setAttribute('aria-hidden', 'true')
          restored.push(() => {
            if (!inert) sibling.removeAttribute('inert')
            if (ariaHidden === null) sibling.removeAttribute('aria-hidden'); else sibling.setAttribute('aria-hidden', ariaHidden)
          })
        }
      }
      if (parent === document.body) break
      branch = parent
    }
    return () => { for (const restore of restored.reverse()) restore() }
  }, [canvas, probe.id])
  useEffect(() => {
    const dialog = dialogRef.current
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
      if (event.key === 'Tab' && dialog?.contains(event.target as Node)) {
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ))
        const first = focusable[0]
        const last = focusable.at(-1)
        const active = document.activeElement
        if (event.shiftKey && (active === first || !focusable.includes(active as HTMLElement))) {
          event.preventDefault(); last?.focus()
        } else if (!event.shiftKey && (active === last || !focusable.includes(active as HTMLElement))) {
          event.preventDefault(); first?.focus()
        }
        return
      }
      if (!CAMERA_KEYS.has(event.key)) return
      const target = event.target
      if (target instanceof HTMLElement && target !== canvas && target !== dialog && target !== titleRef.current) return
      event.preventDefault()
      const key = event.key === '=' ? '+' : event.key
      emit(controller.keyboard(key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight' | '+' | '-'))
    }
    canvas?.addEventListener('pointerdown', down); canvas?.addEventListener('pointermove', move)
    canvas?.addEventListener('pointerup', end); canvas?.addEventListener('pointercancel', cancel)
    canvas?.addEventListener('lostpointercapture', cancel); canvas?.addEventListener('wheel', wheel, { passive: false })
    canvas?.addEventListener('contextmenu', context); canvas?.addEventListener('keydown', keyboard)
    dialog?.addEventListener('keydown', keyboard)
    return () => {
      canvas?.removeEventListener('pointerdown', down); canvas?.removeEventListener('pointermove', move)
      canvas?.removeEventListener('pointerup', end); canvas?.removeEventListener('pointercancel', cancel)
      canvas?.removeEventListener('lostpointercapture', cancel); canvas?.removeEventListener('wheel', wheel)
      canvas?.removeEventListener('contextmenu', context); canvas?.removeEventListener('keydown', keyboard)
      dialog?.removeEventListener('keydown', keyboard)
    }
    function emitReset() { callbacksRef.current.onPoseChange(controller.reset()) }
  }, [canvas, controller, probe.id])

  const apply = (operation: (controller: ProbeInspectionController) => InspectionPose) => {
    onPoseChange(operation(controller))
  }
  return <aside ref={dialogRef} className="probe-inspection" role="dialog" aria-modal="true" aria-labelledby="probe-inspection-title">
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
      {scanning ? '正在扫描当前探测器。' : scanError ?? (scanComplete ? '扫描完成，已开放当前文章链接。' : '尚未开始扫描。')}
    </p>
  </aside>
}
