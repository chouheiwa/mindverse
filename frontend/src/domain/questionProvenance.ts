import type { UniverseIndex } from './universe'

/**
 * 「你为什么在这」：落到一颗问题行星上，资料卡先回答这颗星球和你的关系。
 *
 * 全部来自已收录回答上的绑定（创作/收藏及其时间）与恒星、星群的元数据；
 * 没有任何推断 —— 没有绑定就老实说是公开搜索发现的。
 */
export interface QuestionProvenance {
  /** 最早那次痕迹的一句话；问题不存在时为 null。 */
  readonly origin: string | null
  readonly starName: string | null
  readonly clusterName: string | null
  readonly rank: Readonly<{ index: number; count: number }>
  readonly createdCount: number
  readonly collectedCount: number
  readonly firstAt?: number
  readonly latestAt?: number
}

export interface QuestionProvenanceInput {
  readonly starId: string
  readonly orbitIndex: number
  readonly orbitCount: number
}

const MONTH_FORMATTER = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', timeZone: 'Asia/Shanghai' })

/** 2025.12 这种月份写法。 */
export function formatTraceMonth(seconds: number): string {
  const date = new Date(seconds * 1000)
  if (!Number.isFinite(date.getTime())) return '未知时间'
  const parts = Object.fromEntries(MONTH_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]))
  // zh-CN 的 2-digit 月份在部分 ICU 里不补零（"3" 而不是 "03"），自己补。
  return `${parts.year}.${String(parts.month).padStart(2, '0')}`
}

export function describeQuestionProvenance(
  index: UniverseIndex,
  questionId: string,
  input: QuestionProvenanceInput,
): QuestionProvenance {
  const star = index.starsById.get(input.starId) ?? null
  const cluster = star ? index.universe.clusters.find(({ g }) => g === star.g) ?? null : null
  const rank = Object.freeze({
    index: Math.max(1, Math.floor(Number.isFinite(input.orbitIndex) ? input.orbitIndex : 1)),
    count: Math.max(1, Math.floor(Number.isFinite(input.orbitCount) ? input.orbitCount : 1)),
  })
  const question = index.questionsById.get(questionId)
  if (!question) {
    return Object.freeze({
      origin: null, starName: star?.c ?? null, clusterName: cluster?.name ?? null, rank,
      createdCount: 0, collectedCount: 0,
    })
  }

  let createdCount = 0
  let collectedCount = 0
  let earliest: { at: number; relation: 'created' | 'collected'; authorName: string } | null = null
  let latestAt: number | undefined
  for (const answerId of question.answerIds) {
    const answer = index.answersById.get(answerId)
    if (!answer) continue
    let created = false
    let collected = false
    for (const binding of answer.bindings) {
      if (binding.relation === 'created') created = true
      else if (binding.relation === 'collected') collected = true
      else continue
      const at = binding.at
      if (at === undefined || !Number.isFinite(at)) continue
      if (!earliest || at < earliest.at) earliest = { at, relation: binding.relation, authorName: answer.authorName ?? '' }
      if (latestAt === undefined || at > latestAt) latestAt = at
    }
    if (created) createdCount += 1
    if (collected) collectedCount += 1
  }

  const origin = earliest
    ? `你在 ${formatTraceMonth(earliest.at)} ${earliest.relation === 'created' ? '写下了' : '收藏了'}${earliest.authorName ? `${earliest.authorName}的` : ''}回答`
    : createdCount + collectedCount > 0
      ? '有你的创作或收藏，但没有记录时间'
      : '通过公开搜索发现，没有你的创作或收藏'

  return Object.freeze({
    origin,
    starName: star?.c ?? null,
    clusterName: cluster?.name ?? null,
    rank,
    createdCount,
    collectedCount,
    ...(earliest ? { firstAt: earliest.at } : {}),
    ...(latestAt === undefined ? {} : { latestAt }),
  })
}
