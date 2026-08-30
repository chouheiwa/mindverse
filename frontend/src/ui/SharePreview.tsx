import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ApiError } from '../apiCore'
import { createShare, deleteShare, previewShare } from '../shareApi'
import type { CreatedShare, SharePreview as Preview, Universe } from '../types'
import { PublicShareContent } from './PublicShareContent'
import { useModalDialogLifecycle } from './modalDialogLifecycle'
import './SharePreview.css'

interface Props {
  open?: boolean
  universe: Universe
  onClose: () => void
  getReturnFocus?: () => HTMLElement | null
}

interface Candidate { id: string; title: string; stars: string[] }
const CANDIDATE_BATCH = 20

export function SharePreview({ open = true, universe, onClose, getReturnFocus }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const lifecycle = useModalDialogLifecycle(dialogRef, { active: open, getReturnFocus, initialFocusRef: closeRef })
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
  const [candidateVisible, setCandidateVisible] = useState(CANDIDATE_BATCH)
  const [candidateAnnouncement, setCandidateAnnouncement] = useState('')
  const candidateFocusIndex = useRef<number | null>(null)
  const candidateListRef = useRef<HTMLUListElement>(null)
  useLayoutEffect(() => {
    if (candidateFocusIndex.current === null) return
    candidateListRef.current?.querySelector<HTMLInputElement>(`[data-candidate-index="${candidateFocusIndex.current}"]`)?.focus()
    candidateFocusIndex.current = null
  }, [candidateVisible])
  const selectedIds = useMemo(() => [...selected].sort(), [selected])
  const selectionKey = selectedIds.join('\0')
  const [preview, setPreview] = useState<{ key: string; data: Preview } | null>(null)
  const [previewState, setPreviewState] = useState<'idle' | 'pending' | 'error'>('idle')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedShare | null>(null)
  const [createState, setCreateState] = useState<'idle' | 'pending' | 'error'>('idle')
  const [createError, setCreateError] = useState<string | null>(null)
  const [revokeState, setRevokeState] = useState<'idle' | 'pending' | 'error'>('idle')
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [revoked, setRevoked] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    setPreview(null)
    setPreviewError(null)
    setCreateError(null)
    setCreateState('idle')
    setRevoked(false)
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
  const revealCandidates = () => {
    candidateFocusIndex.current = candidateVisible
    const next = Math.min(candidateVisible + CANDIDATE_BATCH, candidates.length)
    setCandidateVisible(next)
    setCandidateAnnouncement(`已显示${next}个候选问题`)
  }

  const canCreate = previewState === 'idle' && createState === 'idle' &&
    !created && preview?.key === selectionKey && preview.data.questions.length > 0
  const operationLocked = createState === 'pending' || revokeState === 'pending'
  const selectionLocked = operationLocked || created !== null
  const submit = async () => {
    if (!canCreate || !preview) return
    setCreateState('pending')
    setCreateError(null)
    setRevoked(false)
    try {
      setCreated(await createShare(selectedIds, preview.data.digest))
      setCreateState('idle')
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) setPreview(null)
      setCreateState('error')
      setCreateError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  const revoke = async () => {
    if (!created || revokeState === 'pending') return
    setRevokeState('pending')
    setRevokeError(null)
    try {
      await deleteShare(created.id)
      setCreated(null)
      setRevokeState('idle')
      setRevoked(true)
      setCopyStatus('')
    } catch (reason) {
      setRevokeState('error')
      setRevokeError(reason instanceof Error ? reason.message : String(reason))
    }
  }
  const copyLink = async () => {
    if (!created) return
    const url = new URL(created.url, location.origin).href
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setCopyStatus('链接已复制')
      return
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.append(textarea)
      textarea.select()
      const copied = typeof document.execCommand === 'function' && document.execCommand('copy')
      textarea.remove()
      setCopyStatus(copied ? '链接已复制' : '复制失败，请手动打开后复制')
    }
  }

  return (
    <dialog ref={dialogRef} className="sp-dialog" aria-labelledby="sp-title" onKeyDown={lifecycle.onKeyDown}
      onCancel={(event) => { event.preventDefault(); if (!operationLocked) onClose() }}>
      <header className="sp-head">
        <div>
          <div className="sp-kicker">公共边界 / 选择后生成</div>
          <h1 id="sp-title">选择分享</h1>
        </div>
        <button ref={closeRef} className="sp-close" disabled={operationLocked} onClick={onClose} aria-label="关闭分享选择">×</button>
      </header>
      <div className="sp-grid">
        <section className="sp-selection">
          <fieldset disabled={selectionLocked}>
            <legend>逐项选择问题</legend>
            <p>初始不选中任何内容。恒星名只用于帮你在本地定位，不会进入公开页。</p>
            <ul ref={candidateListRef}>
              {candidates.slice(0, candidateVisible).map((candidate, index) => (
                <li key={candidate.id}>
                  <label>
                    <input type="checkbox" checked={selected.has(candidate.id)} data-candidate-index={index}
                      disabled={selectionLocked}
                      onChange={(event) => toggle(candidate.id, event.currentTarget.checked)} />
                    <span><b>{candidate.title}</b><small>位于 {candidate.stars.join(' · ')}</small></span>
                  </label>
                </li>
              ))}
            </ul>
            {candidateVisible < candidates.length && <button className="sp-more" onClick={revealCandidates}
              aria-label={`再显示${CANDIDATE_BATCH}个问题（${candidateVisible}/${candidates.length}）`}>
              继续读取候选 <span>{candidateVisible}/{candidates.length}</span>
            </button>}
            {candidateAnnouncement && <p className="sp-status" role="status">{candidateAnnouncement}</p>}
          </fieldset>
          <p className="sp-scope">当前只分享所选问题及其公开答案。文章探测器继续留在私人宇宙，不会随链接公开。</p>
          <p className="sp-scope">本页刷新后无法找回管理入口，创建后请保存链接；会话清除会级联撤销。</p>
        </section>
        <section className="sp-preview" data-testid="share-public-preview">
          <h2>公开预览</h2>
          {selectedIds.length === 0 && <p className="sp-empty">选中问题后，这里才会显示服务端真正将公开的内容。</p>}
          {previewState === 'pending' && <p role="status">正在校验公开字段…</p>}
          {previewState === 'error' && <div role="alert"><p>{previewError}</p><button onClick={() => setRetry((value) => value + 1)}>重新预览</button></div>}
          {createState === 'error' && <div role="alert"><p>{createError}</p><button onClick={() => {
            setCreateState('idle')
            if (!preview) setRetry((value) => value + 1)
          }}>{preview ? '重试创建' : '重新预览'}</button></div>}
          {preview?.key === selectionKey && <PublicShareContent view={preview.data} compact />}
        </section>
      </div>
      <footer className="sp-actions">
        <span>{selectedIds.length}个问题已选</span>
        {revoked && <strong role="status">链接已撤销</strong>}
        {created ? (
          <div className="sp-created">
            <span>有效至 {new Date(created.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span>
            <a href={created.url} target="_blank" rel="noreferrer">打开公开页</a>
            <button disabled={revokeState === 'pending'} onClick={copyLink}>复制链接</button>
            <button disabled={revokeState === 'pending'} onClick={revoke}>{revokeState === 'pending' ? '正在撤销…' : '撤销这个链接'}</button>
            {revokeState === 'error' && <span role="alert">{revokeError} <button onClick={revoke}>重试撤销</button></span>}
            {copyStatus && <span role="status">{copyStatus}</span>}
          </div>
        ) : <button className="primary" disabled={!canCreate} onClick={submit}>
          {createState === 'pending' ? '正在创建…' : '创建公开链接'}
        </button>}
      </footer>
    </dialog>
  )
}
