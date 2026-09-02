import { useRef } from 'react'
import type { AnswerSatellite } from '../types'
import { useModalDialogLifecycle } from './modalDialogLifecycle'
import './AnswerEvidencePanel.css'

const DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'Asia/Shanghai',
})

export interface AnswerEvidencePanelProps {
  answer: AnswerSatellite
  onClose: () => void
  getReturnFocus?: () => HTMLElement | null
}

export function AnswerEvidencePanel({ answer, onClose, getReturnFocus }: AnswerEvidencePanelProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const closedRef = useRef(false)
  const modal = useModalDialogLifecycle(dialogRef, { getReturnFocus, initialFocusRef: headingRef })
  const close = () => {
    if (closedRef.current) return
    closedRef.current = true
    onClose()
  }
  const collected = answer.bindings.some(({ relation }) => relation === 'collected')
  const created = answer.bindings.some(({ relation }) => relation === 'created')

  return (
    <dialog ref={dialogRef} className="aep" aria-modal="true" aria-labelledby="aep-title"
      onCancel={(event) => { event.preventDefault(); close() }}
      onKeyDown={(event) => {
        modal.onKeyDown(event)
        if (event.key === 'Escape') { event.preventDefault(); close() }
      }}>
      <header className="aep-head">
        <div><span>ANSWER SPECIMEN</span><b>证据板</b></div>
        <button type="button" onClick={close} aria-label="关闭答案证据板">×</button>
      </header>
      <main>
        <p className="aep-kicker">CURRENTLY ACCESSIBLE CONTAINER · {answer.id}</p>
        <h1 id="aep-title" ref={headingRef} tabIndex={-1}>{answer.title || '答案标本'}</h1>
        <p className="aep-author">{answer.authorName || '作者未标注'}</p>
        {answer.summary && <p className="aep-summary">{answer.summary}</p>}
        <dl className="aep-times">
          <div><dt>首发时间</dt><dd>{formatEvidenceTime(answer.publishedAt)}</dd></div>
          <div><dt>更新时间</dt><dd>{formatEvidenceTime(answer.updatedAt)}</dd></div>
          <div><dt>观测时间</dt><dd>{formatEvidenceTime(answer.observedAt)}</dd></div>
        </dl>
        <div className="aep-relations" aria-label="可证明的个人关系">
          {created && <span>OAuth 关系 · 我创作</span>}
          {collected && <span>OAuth 关系 · 我收藏</span>}
          {!created && !collected && <span>没有个人关系证明</span>}
        </div>
        {collected && <p className="aep-caution">收藏只表示保存关系，不代表态度。</p>}
        <p className="aep-bias">这里展示当前仍可访问的内容容器；首发时间不证明当前文本在当时已经存在，并受版本偏差影响。</p>
        <a className="aep-source" href={answer.url} target="_blank" rel="noopener noreferrer">打开知乎原回答</a>
      </main>
    </dialog>
  )
}

function formatEvidenceTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return '未知'
  const date = new Date(seconds * 1000)
  return Number.isFinite(date.getTime()) ? DATE_FORMATTER.format(date) : '未知'
}
