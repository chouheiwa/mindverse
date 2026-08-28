import { useEffect, useRef, useState } from 'react'
import type { Universe } from '../types'
import { createShare } from '../api'
import { drawCard } from '../starmap/card'
import './Card.css'

interface Props {
  universe: Universe
  /** 分享页打开的星图不再二次分享 */
  canShare: boolean
  onClose: () => void
}

/**
 * 宇宙身份证。
 *
 * 先建分享快照拿到编号，再把编号画进卡片 —— 卡上那个链接是真的能打开的。
 * 快照只存派生结构，不含任何原文。
 */
export function Card({ universe, canShare, onClose }: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [shareId, setShareId] = useState<string | null>(null)
  const cvRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      let id: string | undefined
      if (canShare) {
        try {
          id = (await createShare()).id
        } catch (e) {
          // 拿不到编号也要出卡，只是不带链接
          setErr(e instanceof Error ? e.message : String(e))
        }
      }
      if (!alive) return
      setShareId(id ?? null)
      const cv = await drawCard(universe, { shareId: id })
      if (!alive) return
      cv.className = 'cd-shot'
      cvRef.current = cv
      holder.current?.replaceChildren(cv)
      setBusy(false)
    })()
    return () => { alive = false }
  }, [universe, canShare])

  const download = () => {
    const cv = cvRef.current
    if (!cv) return
    cv.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `好奇心星图-${shareId ?? '预览'}.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    }, 'image/png')
  }

  const copyLink = async () => {
    if (!shareId) return
    try { await navigator.clipboard.writeText(`${location.origin}/s/${shareId}`) } catch { /* 用户可自行复制 */ }
  }

  return (
    <div className="cd-mask" onClick={onClose}>
      <div className="cd-box" onClick={(e) => e.stopPropagation()}>
        {busy && <div className="cd-busy">正在生成宇宙身份证…</div>}
        <div ref={holder} style={{ display: busy ? 'none' : 'block' }} />
        {!busy && (
          <>
            <div className="cd-actions">
              <button className="primary" onClick={download}>下载图片</button>
              {shareId && <button onClick={copyLink}>复制分享链接</button>}
              <button onClick={onClose}>关闭</button>
            </div>
            <div className={`cd-note${err ? ' warn' : ''}`}>
              {err
                ? `没能创建分享链接（${err}），卡片仍可下载。`
                : shareId
                  ? '分享链接只存算出来的结构，不含任何原文标题 —— 别人点开看到的是同一张星图，内容要回知乎看。30 天后过期。'
                  : '这是预览卡，没有创建分享链接。'}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
