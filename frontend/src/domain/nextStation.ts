import type { UniverseIndex } from './universe'

/**
 * 「看见自己在往哪走」：站在一个问题上，看见自己接着去了哪里。
 *
 * 下一站 = 你在这个问题上最后一次痕迹（创作/收藏的时间）之后，最早留下痕迹的
 * 另一个问题。只用带时间的绑定；没有就没有下一站，不推断。
 */
export interface NextStation {
  readonly questionId: string
  readonly starId: string
  readonly title: string
  /** 到达那一站的时间（秒）。 */
  readonly at: number
}

function traceTimes(index: UniverseIndex, questionId: string): number[] {
  const question = index.questionsById.get(questionId)
  if (!question) return []
  const times: number[] = []
  for (const answerId of question.answerIds) {
    const answer = index.answersById.get(answerId)
    if (!answer) continue
    for (const binding of answer.bindings) {
      if (binding.relation !== 'created' && binding.relation !== 'collected') continue
      if (binding.at !== undefined && Number.isFinite(binding.at)) times.push(binding.at)
    }
  }
  return times
}

export function nextStationAfter(index: UniverseIndex, questionId: string): NextStation | null {
  const here = traceTimes(index, questionId)
  if (here.length === 0) return null
  const leftAt = Math.max(...here)
  let best: NextStation | null = null
  for (const star of index.starsById.values()) {
    for (const otherId of star.questionIds) {
      if (otherId === questionId) continue
      const after = traceTimes(index, otherId).filter((at) => at > leftAt)
      if (after.length === 0) continue
      const arrivedAt = Math.min(...after)
      if (best && arrivedAt >= best.at) continue
      const question = index.questionsById.get(otherId)
      if (!question) continue
      best = { questionId: otherId, starId: star.id, title: question.title, at: arrivedAt }
    }
  }
  return best
}
