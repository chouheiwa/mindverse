import { useLayoutEffect, useRef, useState } from 'react'
import { indexShareView } from '../domain/share'
import type { ShareAnswer, ShareView } from '../types'

const QUESTION_BATCH = 20
const ANSWER_BATCH = 50
const viewKeys = new WeakMap<object, number>()
let nextViewKey = 1
const viewKey = (view: ShareView) => {
  let key = viewKeys.get(view)
  if (key === undefined) { key = nextViewKey++; viewKeys.set(view, key) }
  return key
}
const dateLabel = (seconds: number) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
}).format(new Date(seconds * 1000))
const dateTime = (seconds: number) => new Date(seconds * 1000).toISOString()

function AnswerList({ answers }: { answers: readonly ShareAnswer[] }) {
  const [visible, setVisible] = useState(ANSWER_BATCH)
  const [announcement, setAnnouncement] = useState('')
  const focusIndex = useRef<number | null>(null)
  const holder = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (focusIndex.current === null) return
    holder.current?.querySelector<HTMLElement>(`[data-answer-index="${focusIndex.current}"]`)?.focus()
    focusIndex.current = null
  }, [visible])
  const reveal = () => {
    focusIndex.current = visible
    const next = Math.min(visible + ANSWER_BATCH, answers.length)
    setVisible(next)
    setAnnouncement(`已显示${next}个答案`)
  }
  return (
    <div className="sv-answers" ref={holder}>
      {answers.slice(0, visible).map((answer, index) => (
        <article key={answer.id} aria-label={answer.title} tabIndex={-1} data-answer-index={index}>
          <div className="sv-answer-top">
            <span>{answer.authorId ? (answer.authorName || answer.authorId.slice(7)) : '作者身份未验证'}</span>
            {answer.publishedAt !== undefined && <time dateTime={dateTime(answer.publishedAt)}>{dateLabel(answer.publishedAt)}发布</time>}
          </div>
          <p>{answer.title}</p>
          <div className="sv-answer-foot">
            <span>
              {answer.likeCount !== undefined && `${answer.likeCount} 赞同`}
              {answer.commentCount !== undefined && ` · ${answer.commentCount} 评论`}
              {answer.favoriteCount !== undefined && ` · ${answer.favoriteCount} 收藏`}
            </span>
            <a href={answer.url} target="_blank" rel="noreferrer">核验回答原文</a>
          </div>
        </article>
      ))}
      {visible < answers.length && <button className="sv-more" onClick={reveal}
        aria-label={`再显示${ANSWER_BATCH}个答案（${visible}/${answers.length}）`}>
        继续读取答案 <span>{visible}/{answers.length}</span>
      </button>}
      {announcement && <p className="sv-status" role="status">{announcement}</p>}
    </div>
  )
}

function PublicSharePage({ view, compact }: { view: ShareView; compact: boolean }) {
  const index = indexShareView(view)
  const [visible, setVisible] = useState(QUESTION_BATCH)
  const [announcement, setAnnouncement] = useState('')
  const focusIndex = useRef<number | null>(null)
  const holder = useRef<HTMLOListElement>(null)
  useLayoutEffect(() => {
    if (focusIndex.current === null) return
    holder.current?.querySelector<HTMLElement>(`[data-question-index="${focusIndex.current}"]`)?.focus()
    focusIndex.current = null
  }, [visible])
  if (view.legacy) return <p className="sv-empty">这是旧版分享，不再展示历史私有快照</p>
  if (view.questions.length === 0) return <p className="sv-empty">这个公开视图没有问题</p>
  const reveal = () => {
    focusIndex.current = visible
    const next = Math.min(visible + QUESTION_BATCH, view.questions.length)
    setVisible(next)
    setAnnouncement(`已显示${next}个问题`)
  }
  return (
    <>
      <ol ref={holder} className={`sv-questions${compact ? ' compact' : ''}`}>
        {view.questions.slice(0, visible).map((question, questionIndex) => {
          const answers = question.answerIds.map((id) => index.answersById.get(id)!)
          return <li key={question.id}>
            <div className="sv-question-mark" aria-hidden="true" />
            <div className="sv-question-body">
              <h2 tabIndex={-1} data-question-index={questionIndex}>{question.title}</h2>
              <a href={question.url} target="_blank" rel="noreferrer">查看问题原页</a>
              {answers.length === 0 ? <p className="sv-no-answer">未选入可公开展示的回答</p> : <AnswerList answers={answers} />}
            </div>
          </li>
        })}
      </ol>
      {visible < view.questions.length && <button className="sv-more" onClick={reveal}
        aria-label={`再显示${QUESTION_BATCH}个问题（${visible}/${view.questions.length}）`}>
        继续读取问题 <span>{visible}/{view.questions.length}</span>
      </button>}
      {announcement && <p className="sv-status" role="status">{announcement}</p>}
    </>
  )
}

export function PublicShareContent({ view, compact = false }: { view: ShareView; compact?: boolean }) {
  return <PublicSharePage key={viewKey(view)} view={view} compact={compact} />
}
