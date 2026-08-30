import { useEffect, useRef } from 'react'
import type { PlanetDatum } from '../starmap/gl/bodies'
import './QuestionEntryShell.css'

const publicDate = (seconds: number | undefined) => seconds === undefined
  ? '公开时间未知'
  : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' })
    .format(new Date(seconds * 1000))

export function QuestionEntryShell({ planet, onBack }: { planet: PlanetDatum; onBack: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headingRef.current?.focus()
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onBack()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onBack])

  return (
    <section className="qes" role="dialog" aria-modal="true" aria-labelledby="qes-title">
      <header className="qes-head">
        <button type="button" className="qes-back" onClick={onBack} aria-label="返回问题航道">← 返回问题航道</button>
        <span>QUESTION OBSERVATORY · ORBIT {String(planet.orbitIndex).padStart(2, '0')}</span>
        <a href={planet.question.url} target="_blank" rel="noopener noreferrer">知乎原问题</a>
      </header>
      <main className="qes-main">
        <div className="qes-titleblock">
          <p>问题行星 · {planet.answerCount} 个已收录回答卫星</p>
          <h1 id="qes-title" ref={headingRef} tabIndex={-1}>{planet.question.title}</h1>
        </div>
        <section className="qes-evidence" aria-labelledby="qes-answers">
          <h2 id="qes-answers">已收录的回答卫星</h2>
          {planet.answers.length ? (
            <ol>
              {planet.answers.map((answer) => (
                <li key={answer.id}>
                  <div className="qes-answer-meta">
                    <span>{answer.authorName || '作者未标注'}</span>
                    <time>{publicDate(answer.updatedAt ?? answer.publishedAt)}</time>
                    <span>{answer.likeCount ?? 0} 赞同 · {answer.commentCount ?? 0} 评论</span>
                  </div>
                  {answer.summary && <p>{answer.summary}</p>}
                  <a href={answer.url} target="_blank" rel="noopener noreferrer">
                    {answer.authorName ? `查看 ${answer.authorName} 的知乎回答` : '查看知乎原回答'}
                  </a>
                </li>
              ))}
            </ol>
          ) : <p className="qes-empty">这个问题尚无已收录回答卫星，可先核验知乎原问题。</p>}
        </section>
        <aside className="qes-pending" aria-label="观察能力状态">
          <span>OBSERVATION STATUS</span>
          <h2>深度观察模式尚未生成</h2>
          <p>目前可核验问题与已收录回答原文；立场对照、证据标注和判断工作区将在后续阶段提供。</p>
        </aside>
      </main>
    </section>
  )
}
