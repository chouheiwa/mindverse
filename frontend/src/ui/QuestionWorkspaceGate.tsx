import { Component, createElement, lazy, Suspense, useLayoutEffect, useRef, useState, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'
import type { QuestionWorkspaceProps } from './QuestionWorkspace'
import { loadQuestionWorkspace, type QuestionWorkspaceLoader } from './questionWorkspaceLoader'

const lazyAttempts = new WeakMap<QuestionWorkspaceLoader, LazyExoticComponent<ComponentType<QuestionWorkspaceProps>>[]>()

function lazyWorkspace(loader: QuestionWorkspaceLoader, attempt: number) {
  const attempts = lazyAttempts.get(loader) ?? []
  if (!attempts[attempt]) attempts[attempt] = lazy(loader)
  lazyAttempts.set(loader, attempts)
  return attempts[attempt]
}

function StatusModal({ kind, onExit, onRetry }: {
  kind: 'loading' | 'error'
  onExit: () => void
  onRetry?: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef(false)
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const inerted: Array<{ element: HTMLElement; had: boolean }> = []
    let branch: HTMLElement = dialog
    while (branch.parentElement) {
      const parent = branch.parentElement
      for (const sibling of parent.children) {
        if (sibling === branch || !(sibling instanceof HTMLElement)) continue
        inerted.push({ element: sibling, had: sibling.hasAttribute('inert') })
        sibling.setAttribute('inert', '')
      }
      branch = parent
      if (parent === document.body) break
    }
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal()
    } else dialog.setAttribute('open', '')
    dialog.querySelector<HTMLElement>('button, [tabindex="-1"]')?.focus()
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close()
      else dialog.removeAttribute('open')
      for (const item of inerted) if (!item.had) item.element.removeAttribute('inert')
    }
  }, [])
  const exit = () => {
    if (closeRef.current) return
    closeRef.current = true
    onExit()
  }
  const title = kind === 'loading' ? '正在建立问题工作台' : '问题工作台加载失败'
  return <dialog ref={dialogRef} className="uv-entry-modal" aria-modal="true" aria-labelledby={`uv-entry-${kind}`}
    onCancel={(event) => { event.preventDefault(); exit() }}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); exit() } }}>
    <div className="uv-entry-state">
      <h1 id={`uv-entry-${kind}`} tabIndex={-1}>{title}</h1>
      {kind === 'loading'
        ? <p role="status">正在建立问题航道…</p>
        : <p>未能加载问题工作台。宇宙仍保持在进入前的位置，你可以重试或安全返回。</p>}
      <div>
        <button type="button" onClick={exit}>返回宇宙</button>
        {kind === 'error' && <button type="button" onClick={onRetry}>重新加载</button>}
      </div>
    </div>
  </dialog>
}

class WorkspaceErrorBoundary extends Component<{
  children: ReactNode
  onExit: () => void
  onRetry: () => void
}, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    return this.state.failed
      ? <StatusModal kind="error" onExit={this.props.onExit} onRetry={this.props.onRetry} />
      : this.props.children
  }
}

export function QuestionWorkspaceGate({ loader = loadQuestionWorkspace, ...props }: QuestionWorkspaceProps & {
  loader?: QuestionWorkspaceLoader
}) {
  const [attempt, setAttempt] = useState(0)
  const LazyWorkspace = lazyWorkspace(loader, attempt)
  const exit = () => { props.onRestoreCamera(); props.onBack() }
  return <WorkspaceErrorBoundary key={attempt} onExit={exit} onRetry={() => setAttempt((value) => value + 1)}>
    <Suspense fallback={<StatusModal kind="loading" onExit={exit} />}>
      {createElement(LazyWorkspace, props)}
    </Suspense>
  </WorkspaceErrorBoundary>
}
