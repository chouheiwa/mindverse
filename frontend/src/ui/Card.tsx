import { useEffect, useRef, useState } from 'react'
import type { Universe } from '../types'
import { drawCard } from '../starmap/card'
import './Card.css'

interface Props {
  universe: Universe
  onClose: () => void
}

/**
 * 宇宙身份证。
 *
 * Task 8 接入问题行星选择前，这里只生成本地预览图，不触发分享写入。
 */
export function Card({ universe, onClose }: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(true)
  const cvRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!alive) return
      const cv = await drawCard(universe)
      if (!alive) return
      cv.className = 'cd-shot'
      cvRef.current = cv
      holder.current?.replaceChildren(cv)
      setBusy(false)
    })()
    return () => { alive = false }
  }, [universe])

  const download = () => {
    const cv = cvRef.current
    if (!cv) return
    cv.toBlob((b) => {
      if (!b) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(b)
      a.download = `好奇心星图-预览.png`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    }, 'image/png')
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
              <button onClick={onClose}>关闭</button>
            </div>
            <div className="cd-note">
              请先进入问题行星选择分享内容。当前只下载本地预览卡。
            </div>
          </>
        )}
      </div>
    </div>
  )
}
