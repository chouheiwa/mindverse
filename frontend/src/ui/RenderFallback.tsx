import { probesForStar, questionsForStar, type UniverseIndex } from '../domain/universe'

interface RenderFallbackProps {
  index: UniverseIndex
  message: string
  onRetry: () => void
  onSeed: () => void
}

export function RenderFallback({ index, message, onRetry, onSeed }: RenderFallbackProps) {
  const { universe } = index
  return (
    <main className="render-fallback" role="main">
      <header>
        <div className="lbl">知乎精神宇宙 · 文本模式</div>
        <h1>3D 星图暂时不可用</h1>
        <p role="alert">{message}</p>
        <div>
          <button onClick={onRetry}>重试 3D</button>
          <button onClick={onSeed}>换成游客模式，现场挑几个方向</button>
        </div>
      </header>
      <nav aria-label="宇宙文本导航">
        {universe.clusters.map((cluster) => (
          <section key={cluster.g}>
            <h2>{cluster.name}</h2>
            {universe.stars.filter((star) => star.g === cluster.g).map((star) => (
              <section key={star.c}>
                <h3>{star.c}</h3>
                <ul>
                  {questionsForStar(index, star).map((question) => (
                    <li key={question.id}>
                      <a href={question.url} target="_blank" rel="noreferrer">{question.title}</a>
                      <ul>
                        {question.answerIds.flatMap((id) => {
                          const answer = index.answersById.get(id)
                          return answer ? [
                            <li key={answer.id}>
                              <a href={answer.url} target="_blank" rel="noreferrer">
                                {answer.authorName || '知乎用户'} · 回答原文
                              </a>
                            </li>,
                          ] : []
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
                {probesForStar(index, star).length > 0 && <>
                  <h4>文章</h4>
                  <ul>
                    {probesForStar(index, star).map((probe) => (
                      <li key={probe.id}>
                        <a href={probe.url} target="_blank" rel="noreferrer">{probe.title} · 文章原文</a>
                      </li>
                    ))}
                  </ul>
                </>}
              </section>
            ))}
          </section>
        ))}
      </nav>
    </main>
  )
}
