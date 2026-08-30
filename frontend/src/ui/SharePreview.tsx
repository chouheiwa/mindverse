import { useEffect, useMemo, useRef, useState } from 'react'
import { createShare, deleteShare, previewShare } from '../api'
import type { CreatedShare, SharePreview as Preview, Universe } from '../types'
import { PublicShareContent } from './PublicShareContent'
import { useModalDialogLifecycle } from './modalDialogLifecycle'
import './SharePreview.css'

interface Props {
  universe: Universe
  onClose: () => void
  getReturnFocus?: () => HTMLElement | null
}

interface Candidate { id: string; title: string; stars: string[] }

export function SharePreview({ universe, onClose, getReturnFocus }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const lifecycle = useModalDialogLifecycle(dialogRef, { getReturnFocus, initialFocusRef: closeRef })
  const candidates = useMemo<Candidate[]>(() => {
    if (universe.schemaVersion !== 'universe.v1') return []
    const contexts = new Map<string, Set<string>>()
    for (const star of universe.stars) for (const id of star.questionIds) {
      if (!contexts.has(id)) contexts.set(id, new Set())
      contexts.get(id)!.add(star.c)
    }
    return universe.questions.filter((question) => contexts.has(question.id)).map((question) => ({
      id: question.id, title: question.title, stars: [...contexts.get(question.id)!].sort(),
    })).sort((left, right) => left.id.localeCompare(right.id))
  }, [universe])
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const selectedIds = useMemo(() => [...selected].sort(), [selected])
  const selectionKey = selectedIds.join('\0')
  const selectionKeyRef = useRef(selectionKey)
  selectionKeyRef.current = selectionKey
  const mountedRef = useRef(true)
  const [preview, setPreview] = useState<{ key: string; data: Preview } | null>(null)
  const [previewState, setPreviewState] = useState<'idle' | 'pending' | 'error'>('idle')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedShare | null>(null)
  const [createState, setCreateState] = useState<'idle' | 'pending' | 'error' | 'revoked'>('idle')
  const [createError, setCreateError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  useEffect(() => {
    setPreview(null)
    setPreviewError(null)
    setCreated(null)
    setCreateError(null)
    setCreateState('idle')
    if (selectedIds.length === 0) { setPreviewState('idle'); return }
    const controller = new AbortController()
    const key = selectionKey
    setPreviewState('pending')
    previewShare(selectedIds, controller.signal).then((data) => {
      if (controller.signal.aborted) return
      setPreview({ key, data })
      setPreviewState('idle')
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      setPreviewState('error')
      setPreviewError(reason instanceof Error ? reason.message : String(reason))
    })
    return () => controller.abort()
  // selectedIds is intentionally represented by its stable scalar key.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, retry])

  const toggle = (id: string, checked: boolean) => setSelected((current) => {
    const next = new Set(current)
    if (checked) next.add(id); else next.delete(id)
    return next
  })

  const canCreate = previewState === 'idle' && createState === 'idle' &&
    preview?.key === selectionKey && preview.data.questions.length > 0
  const submit = async () => {
    if (!canCreate || !preview) return
    const submittedKey = selectionKey
    setCreateState('pending')
    setCreateError(null)
    try {
      const result = await createShare(selectedIds, preview.data.digest)
      if (!mountedRef.current || selectionKeyRef.current !== submittedKey) {
        void deleteShare(result.id).catch(() => {})
        return
      }
      setCreated(result)
      setCreateState('idle')
    } catch (reason) {
      setPreview(null)
      setCreateState('error')
      setCreateError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  const revoke = async () => {
    if (!created) return
    try {
      await deleteShare(created.id)
      setCreated(null)
      setCreateState('revoked')
    } catch (reason) {
      setCreateError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <dialog ref={dialogRef} className="sp-dialog" aria-labelledby="sp-title" onKeyDown={lifecycle.onKeyDown}
      onCancel={(event) => { event.preventDefault(); onClose() }}>
      <header className="sp-head">
        <div>
          <div className="sp-kicker">公共边界 / 选择后生成</div>
          <h1 id="sp-title">选择分享</h1>
        </div>
        <button ref={closeRef} className="sp-close" onClick={onClose} aria-label="关闭分享选择">×</button>
      </header>
      <div className="sp-grid">
        <section className="sp-selection">
          <fieldset>
            <legend>逐项选择问题</legend>
            <p>初始不选中任何内容。恒星名只用于帮你在本地定位，不会进入公开页。</p>
            <ul>
              {candidates.map((candidate) => (
                <li key={candidate.id}>
                  <label>
                    <input type="checkbox" checked={selected.has(candidate.id)}
                      onChange={(event) => toggle(candidate.id, event.currentTarget.checked)} />
                    <span><b>{candidate.title}</b><small>位于 {candidate.stars.join(' · ')}</small></span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
          <p className="sp-scope">当前只分享所选问题及其公开答案。文章探测器继续留在私人宇宙，不会随链接公开。</p>
        </section>
        <section className="sp-preview" aria-live="polite" data-testid="share-public-preview">
          <h2>公开预览</h2>
          {selectedIds.length === 0 && <p className="sp-empty">选中问题后，这里才会显示服务端真正将公开的内容。</p>}
          {previewState === 'pending' && <p role="status">正在校验公开字段…</p>}
          {previewState === 'error' && <div role="alert"><p>{previewError}</p><button onClick={() => setRetry((value) => value + 1)}>重新预览</button></div>}
          {createState === 'error' && <div role="alert"><p>{createError}</p><button onClick={() => { setCreateState('idle'); setRetry((value) => value + 1) }}>重新预览</button></div>}
          {preview?.key === selectionKey && <PublicShareContent view={preview.data} compact />}
        </section>
      </div>
      <footer className="sp-actions">
        <span>{selectedIds.length}个问题已选</span>
        {createState === 'revoked' && <strong role="status">链接已撤销</strong>}
        {created ? (
          <div className="sp-created">
            <span>有效至 {new Date(created.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span>
            <a href={created.url} target="_blank" rel="noreferrer">打开公开页</a>
            <button onClick={() => navigator.clipboard?.writeText(new URL(created.url, location.origin).href)}>复制链接</button>
            <button onClick={revoke}>撤销这个链接</button>
          </div>
        ) : <button className="primary" disabled={!canCreate} onClick={submit}>
          {createState === 'pending' ? '正在创建…' : '创建公开链接'}
        </button>}
      </footer>
    </dialog>
  )
}
