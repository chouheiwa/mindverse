import type { UniverseIndex } from './universe'
import type { AnswerSatellite, UserContentRelation } from '../types'
import { CHRONICLE_REQUIREMENTS, hasUTCYearSpan } from '../ui/questionWorkspaceModel'

export interface AnswerSpecimen {
  readonly answerId: string
  readonly publishedAt: number | null
  readonly updatedAt: number | null
  readonly observedAt: number | null
  readonly authorId: string | null
  readonly relations: readonly UserContentRelation[]
}

export interface TimeStratumScene {
  readonly id: string
  readonly startPublishedAt: number
  readonly endPublishedAt: number
  readonly centerDepth: number
  readonly thickness: number
  readonly specimens: readonly AnswerSpecimen[]
}

export interface StrataSceneModel {
  readonly version: 'strata-layout.v1'
  readonly questionId: string
  readonly evidenceLevel: 'surface-only' | 'retrospective'
  readonly disclaimer: string
  readonly surfaceSpecimens: readonly AnswerSpecimen[]
  readonly strata: readonly TimeStratumScene[]
  readonly undated: readonly AnswerSpecimen[]
  readonly bounds: Readonly<{ top: number; bottom: number }>
}

const DISCLAIMER = '当前仍可访问的答案按首发时间排列，不代表当年观点或社区份额；地层存在幸存者偏差与版本偏差。'
const DAY_SECONDS = 86_400
const MAX_LAYERS = 8
const SCORE_EPSILON = 1e-12

export class StrataQuestionNotFoundError extends Error {
  readonly code = 'question_not_found'

  constructor(readonly questionId: string) {
    super(`question not found: ${questionId}`)
    this.name = 'StrataQuestionNotFoundError'
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const item of Object.values(value as Record<string, unknown>)) deepFreeze(item)
  return Object.freeze(value)
}

function specimen(answer: AnswerSatellite): AnswerSpecimen {
  const relations = [...new Set(answer.bindings.map(({ relation }) => relation))]
    .sort((left, right) => left === right ? 0 : left === 'created' ? -1 : 1)
  return {
    answerId: answer.id,
    publishedAt: validPublishedAt(answer.publishedAt) ? answer.publishedAt : null,
    updatedAt: finiteOrNull(answer.updatedAt),
    observedAt: finiteOrNull(answer.observedAt),
    authorId: answer.authorId?.trim() || null,
    relations,
  }
}

const finiteOrNull = (value: number | undefined): number | null =>
  value !== undefined && Number.isFinite(value) ? value : null

const validPublishedAt = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0

const authorCount = (answers: readonly AnswerSatellite[]): number =>
  new Set(answers.flatMap(({ authorId }) => authorId?.trim() ? [authorId.trim()] : [])).size

const legalLayer = (answers: readonly AnswerSatellite[]): boolean =>
  answers.length >= 3 && authorCount(answers) >= 3

function surfaceOnly(questionId: string, answers: readonly AnswerSatellite[]): StrataSceneModel {
  return deepFreeze({
    version: 'strata-layout.v1' as const,
    questionId,
    evidenceLevel: 'surface-only' as const,
    disclaimer: DISCLAIMER,
    surfaceSpecimens: answers.map(specimen),
    strata: [],
    undated: [],
    bounds: { top: 0, bottom: 0 },
  })
}

interface CandidateBoundary {
  readonly position: number
  readonly score: number
}

interface SegmentationPath {
  readonly score: number
  readonly boundaries: readonly number[]
}

const rounded = (value: number): number => Math.round(value * 1_000_000) / 1_000_000

function median(values: readonly number[]): number {
  if (values.length === 0) return 1
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function lexicalBoundaryCompare(
  left: readonly number[],
  right: readonly number[],
  answers: readonly AnswerSatellite[],
): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const leftId = answers[left[index]].id
    const rightId = answers[right[index]].id
    if (leftId !== rightId) return leftId < rightId ? -1 : 1
  }
  return left.length - right.length
}

function betterPath(
  candidate: SegmentationPath,
  incumbent: SegmentationPath | undefined,
  answers: readonly AnswerSatellite[],
): boolean {
  if (!incumbent) return true
  if (candidate.score > incumbent.score + SCORE_EPSILON) return true
  if (incumbent.score > candidate.score + SCORE_EPSILON) return false
  return lexicalBoundaryCompare(candidate.boundaries, incumbent.boundaries, answers) < 0
}

function candidateBoundaries(answers: readonly AnswerSatellite[]): readonly CandidateBoundary[] {
  const gaps = answers.slice(1).map((answer, index) =>
    ((answer.publishedAt as number) - (answers[index].publishedAt as number)) / DAY_SECONDS)
  const medianPositiveGapDays = median(gaps.filter((gap) => gap > 0))
  const gapThreshold = Math.max(180, 3 * medianPositiveGapDays)
  return gaps.flatMap((gapDays, index) => {
    const position = index + 1
    const previous = new Date((answers[index].publishedAt as number) * 1000)
    const next = new Date((answers[position].publishedAt as number) * 1000)
    const yearChanged = previous.getUTCFullYear() !== next.getUTCFullYear()
    if (!yearChanged && gapDays <= gapThreshold) return []
    return [{
      position,
      score: (yearChanged ? 0.25 : 0) + Math.log1p(gapDays / medianPositiveGapDays),
    }]
  })
}

function segment(answers: readonly AnswerSatellite[]): readonly number[] | null {
  const candidates = candidateBoundaries(answers)
  const scoreByPosition = new Map(candidates.map(({ position, score }) => [position, score]))
  const positions = [0, ...candidates.map(({ position }) => position), answers.length]
  const paths = new Map<string, SegmentationPath>()
  paths.set('0:0', { score: 0, boundaries: [] })

  for (const end of positions.slice(1)) {
    for (let layerCount = 1; layerCount <= MAX_LAYERS; layerCount += 1) {
      let best: SegmentationPath | undefined
      for (const start of positions) {
        if (start >= end) break
        const previous = paths.get(`${start}:${layerCount - 1}`)
        if (!previous || !legalLayer(answers.slice(start, end))) continue
        const isFinal = end === answers.length
        const path: SegmentationPath = {
          score: previous.score + (isFinal ? 0 : scoreByPosition.get(end) ?? 0),
          boundaries: isFinal ? previous.boundaries : [...previous.boundaries, end],
        }
        if (betterPath(path, best, answers)) best = path
      }
      if (best) paths.set(`${end}:${layerCount}`, best)
    }
  }

  let winner: (SegmentationPath & { readonly layers: number }) | undefined
  for (let layers = 2; layers <= MAX_LAYERS; layers += 1) {
    const path = paths.get(`${answers.length}:${layers}`)
    if (!path) continue
    const challenger = { ...path, layers }
    if (!winner
      || challenger.score > winner.score + SCORE_EPSILON
      || (Math.abs(challenger.score - winner.score) <= SCORE_EPSILON
        && (challenger.layers < winner.layers
          || (challenger.layers === winner.layers
            && lexicalBoundaryCompare(challenger.boundaries, winner.boundaries, answers) < 0)))) {
      winner = challenger
    }
  }
  return winner?.boundaries ?? null
}

function layerThickness(groups: readonly (readonly AnswerSatellite[])[]): readonly number[] {
  const spans = groups.map((group) =>
    ((group.at(-1)?.publishedAt as number) - (group[0].publishedAt as number)) / DAY_SECONDS)
  const maxLayerLogSpan = Math.max(1, ...spans.map((span) => Math.log1p(span)))
  const maxLayerLogCount = Math.max(1, ...groups.map((group) => Math.log1p(group.length)))
  return groups.map((group, index) => rounded(Math.min(18, Math.max(4,
    4 + 14 * (0.65 * (Math.log1p(spans[index]) / maxLayerLogSpan)
      + 0.35 * (Math.log1p(group.length) / maxLayerLogCount)),
  ))))
}

export function buildStrataSceneModel(index: UniverseIndex, questionId: string): StrataSceneModel {
  const question = index.questionsById.get(questionId)
  if (!question) throw new StrataQuestionNotFoundError(questionId)

  const seen = new Set<string>()
  const answers = question.answerIds.flatMap((answerId) => {
    if (seen.has(answerId)) return []
    seen.add(answerId)
    const answer = index.answersById.get(answerId)
    return answer ? [answer] : []
  })
  const dated = answers.filter((answer) => validPublishedAt(answer.publishedAt))
    .sort((left, right) => (left.publishedAt as number) - (right.publishedAt as number) || left.id.localeCompare(right.id))
  const epochs = dated.map(({ publishedAt }) => publishedAt as number)
  const gateOpen = dated.length >= CHRONICLE_REQUIREMENTS.eligibleAnswers
    && authorCount(dated) >= CHRONICLE_REQUIREMENTS.stableAuthors
    && hasUTCYearSpan(epochs[0] ?? 0, epochs.at(-1) ?? 0, CHRONICLE_REQUIREMENTS.calendarYears)
  if (!gateOpen) return surfaceOnly(questionId, answers)

  const boundaries = segment(dated)
  if (!boundaries) return surfaceOnly(questionId, answers)

  const chronologicalGroups = [0, ...boundaries].map((start, index, starts) =>
    dated.slice(start, starts[index + 1] ?? dated.length))
  const groups = chronologicalGroups.reverse()
  const thicknesses = layerThickness(groups)
  let depth = 0
  const strata = groups.map((group, layerIndex): TimeStratumScene => {
    const thickness = thicknesses[layerIndex]
    const startPublishedAt = group[0].publishedAt as number
    const endPublishedAt = group.at(-1)?.publishedAt as number
    const result = {
      id: `stratum:${questionId}:${group[0].id}:${group.at(-1)?.id}`,
      startPublishedAt,
      endPublishedAt,
      centerDepth: rounded(depth + thickness / 2),
      thickness,
      specimens: group.map(specimen),
    }
    depth = rounded(depth + thickness)
    return result
  })

  return deepFreeze({
    version: 'strata-layout.v1' as const,
    questionId,
    evidenceLevel: 'retrospective' as const,
    disclaimer: DISCLAIMER,
    surfaceSpecimens: [],
    strata,
    undated: answers.filter(({ publishedAt }) => !validPublishedAt(publishedAt)).map(specimen),
    bounds: { top: 0, bottom: depth },
  })
}
