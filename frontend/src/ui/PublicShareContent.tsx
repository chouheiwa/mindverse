import { indexShareView } from '../domain/share'
import type { ShareView } from '../types'

const dateLabel = (seconds: number) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
}).format(new Date(seconds * 1000))
const dateTime = (seconds: number) => new Date(seconds * 1000).toISOString()

export function PublicShareContent({ view, compact = false }: { view: ShareView; compact?: boolean }) {
  const index = indexShareView(view)
  if (view.legacy) return <p className="sv-empty">这是旧版分享，不再展示历史私有快照</p>
  if (view.questions.length === 0) return <p className="sv-empty">这个公开视图没有问题</p>
  return (
    <ol className={`sv-questions${compact ? ' compact' : ''}`}>
      {view.questions.map((question) => (
        <li key={question.id}>
          <div className="sv-question-mark" aria-hidden="true" />
          <div className="sv-question-body">
            <h2>{question.title}</h2>
            <a href={question.url} target="_blank" rel="noreferrer">查看问题原页</a>
            {question.answerIds.length === 0 ? (
              <p className="sv-no-answer">未选入可公开展示的回答</p>
            ) : (
              <div className="sv-answers">
                {question.answerIds.map((id) => {
                  const answer = index.answersById.get(id)!
                  return (
                    <article key={answer.id} aria-label={answer.title}>
                      <div className="sv-answer-top">
                        <span>{answer.authorId ? (answer.authorName || answer.authorId.slice(7)) : '作者身份未验证'}</span>
                        {answer.publishedAt !== undefined && (
                          <time dateTime={dateTime(answer.publishedAt)}>{dateLabel(answer.publishedAt)}发布</time>
                        )}
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
                  )
                })}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
