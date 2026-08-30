import type { UniverseIndex } from '../domain/universe'
import type { DiscoverySource, UserContentRelation } from '../types'

const SECONDS_PER_DAY = 86_400

export const CHRONICLE_REQUIREMENTS = Object.freeze({
  eligibleAnswers: 12,
  stableAuthors: 3,
  spanDays: 3 * 365,
})

export interface WorkspaceAnswer {
  readonly id: string
  readonly title: string
  readonly summary?: string
  readonly url: string
  readonly authorId?: string
  readonly authorName?: string
  readonly publishedAt?: number
  readonly publicEvidence: readonly DiscoverySource[]
}

export interface PersonalWorkspaceAnswer extends WorkspaceAnswer {
  readonly relations: readonly UserContentRelation[]
  readonly folders: readonly string[]
}

interface ChronicleBase {
  readonly requirements: typeof CHRONICLE_REQUIREMENTS
  readonly actual: Readonly<{ eligibleAnswers: number; stableAuthors: number; spanDays: number }>
  readonly flatItems: readonly WorkspaceAnswer[]
}

export interface InsufficientChronicle extends ChronicleBase {
  readonly status: 'insufficient'
}

export interface AvailableChronicle extends ChronicleBase {
  readonly status: 'available'
  readonly kind: 'retrospective_container_timeline'
  readonly disclaimer: string
}

export type QuestionWorkspaceModel = Readonly<{
  status: 'ready'
  question: Readonly<{ id: string; title: string; url: string }>
  answerCount: number
  answers: readonly WorkspaceAnswer[]
  personal?: Readonly<{ items: readonly PersonalWorkspaceAnswer[] }>
  chronicle: InsufficientChronicle | AvailableChronicle
  prism: Readonly<{ status: 'abstained'; reason: '证据不足，暂不生成观点结构'; claims: readonly never[] }>
}> | Readonly<{
  status: 'error'
  code: 'question_not_found'
  message: string
}>

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item)
  return Object.freeze(value)
}

const unique = <T>(items: readonly T[]): T[] => [...new Set(items)]

export function buildQuestionWorkspaceModel(
  index: UniverseIndex,
  questionId: string,
  options: Readonly<{ shared?: boolean; readOnly?: boolean }> = {},
): QuestionWorkspaceModel {
  const question = index.questionsById.get(questionId)
  if (!question) {
    return deepFreeze({
      status: 'error' as const,
      code: 'question_not_found' as const,
      message: '未找到这个问题，无法建立问题工作台。',
    })
  }

  const seen = new Set<string>()
  const answers: WorkspaceAnswer[] = []
  const personalItems: PersonalWorkspaceAnswer[] = []
  const privateSession = !options.shared && !options.readOnly
  for (const answerId of question.answerIds) {
    if (seen.has(answerId)) continue
    seen.add(answerId)
    const answer = index.answersById.get(answerId)
    if (!answer) continue
    const publicView: WorkspaceAnswer = {
      id: answer.id,
      title: answer.title,
      ...(answer.summary === undefined ? {} : { summary: answer.summary }),
      url: answer.url,
      ...(answer.authorId === undefined ? {} : { authorId: answer.authorId }),
      ...(answer.authorName === undefined ? {} : { authorName: answer.authorName }),
      ...(answer.publishedAt === undefined ? {} : { publishedAt: answer.publishedAt }),
      publicEvidence: unique(answer.discoverySources),
    }
    if (!privateSession) {
      answers.push(publicView)
      continue
    }
    const relations = unique(answer.bindings.map((binding) => binding.relation))
      .sort((left, right) => (left === right ? 0 : left === 'created' ? -1 : 1))
    const privateView: PersonalWorkspaceAnswer = {
      ...publicView,
      relations,
      folders: unique(answer.bindings.flatMap((binding) => binding.folders).filter(Boolean)),
    }
    answers.push(privateView)
    if (relations.length > 0) personalItems.push(privateView)
  }

  const eligible = answers.filter((answer) =>
    answer.publishedAt !== undefined && Number.isFinite(answer.publishedAt) && answer.publishedAt > 0)
  const stableAuthors = new Set(eligible
    .map((answer) => answer.authorId?.trim())
    .filter((id): id is string => Boolean(id)))
  const epochs = eligible.map((answer) => answer.publishedAt as number)
  const spanDays = epochs.length < 2 ? 0 : Math.floor((Math.max(...epochs) - Math.min(...epochs)) / SECONDS_PER_DAY + Number.EPSILON)
  const actual = {
    eligibleAnswers: eligible.length,
    stableAuthors: stableAuthors.size,
    spanDays,
  }
  const available = actual.eligibleAnswers >= CHRONICLE_REQUIREMENTS.eligibleAnswers
    && actual.stableAuthors >= CHRONICLE_REQUIREMENTS.stableAuthors
    && actual.spanDays >= CHRONICLE_REQUIREMENTS.spanDays
  const chronicle: InsufficientChronicle | AvailableChronicle = available ? {
    status: 'available',
    kind: 'retrospective_container_timeline',
    requirements: CHRONICLE_REQUIREMENTS,
    actual,
    flatItems: [...eligible].sort((left, right) =>
      (left.publishedAt as number) - (right.publishedAt as number) || left.id.localeCompare(right.id)),
    disclaimer: '当前仍可访问的答案按首发时间排列，不代表当年观点或社区份额；列表存在幸存者偏差与版本偏差。',
  } : {
    status: 'insufficient',
    requirements: CHRONICLE_REQUIREMENTS,
    actual,
    flatItems: answers,
  }

  return deepFreeze({
    status: 'ready' as const,
    question: { id: question.id, title: question.title, url: question.url },
    answerCount: answers.length,
    answers,
    ...(privateSession ? { personal: { items: personalItems } } : {}),
    chronicle,
    prism: { status: 'abstained' as const, reason: '证据不足，暂不生成观点结构' as const, claims: [] as never[] },
  })
}
