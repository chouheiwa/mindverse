import type { QuestionPlanetDatum } from '../../domain/universe'
import type { AnswerSatellite } from '../../types'

export type PlanetFamily = 'basalt' | 'strata' | 'cloud' | 'archive'

export interface PlanetMaterialInput {
  seed: number
  family: PlanetFamily
  answerDensity: number
  timeSpan: number | null
  freshness: number
  divergence: null
  created: boolean
  collected: boolean
}

export interface MaterialTimeline {
  readonly earliest: number | null
  readonly latest: number | null
  readonly duration: number
}

const FAMILIES: readonly PlanetFamily[] = ['basalt', 'strata', 'cloud', 'archive']
const ANSWER_DENSITY_REFERENCE = Math.log1p(30)
const MISSING_FRESHNESS = .35
const UINT32_RANGE = 0x1_0000_0000

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function validPublicTime(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function buildMaterialTimeline(allAnswers: readonly AnswerSatellite[]): MaterialTimeline {
  let earliest = Number.POSITIVE_INFINITY
  let latest = Number.NEGATIVE_INFINITY
  for (const answer of allAnswers) {
    for (const value of [answer.publishedAt, answer.updatedAt]) {
      if (!validPublicTime(value)) continue
      earliest = Math.min(earliest, value)
      latest = Math.max(latest, value)
    }
  }
  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
    return Object.freeze({ earliest: null, latest: null, duration: 0 })
  }
  return Object.freeze({ earliest, latest, duration: Math.max(0, latest - earliest) })
}

export function planetMaterialInput(
  datum: QuestionPlanetDatum,
  timeline: MaterialTimeline,
): PlanetMaterialInput {
  const hash = stableHash(datum.question.id)
  const publicTimes: number[] = []
  const publicationTimes: number[] = []
  let created = false
  let collected = false

  for (const answer of datum.answers) {
    if (validPublicTime(answer.publishedAt)) {
      publicationTimes.push(answer.publishedAt)
      publicTimes.push(answer.publishedAt)
    }
    if (validPublicTime(answer.updatedAt)) publicTimes.push(answer.updatedAt)
    for (const binding of answer.bindings) {
      if (binding.relation === 'created') created = true
      if (binding.relation === 'collected') collected = true
    }
  }

  const latestOwnTime = publicTimes.length > 0 ? Math.max(...publicTimes) : null
  const freshness = latestOwnTime === null || timeline.earliest === null || timeline.latest === null
    ? MISSING_FRESHNESS
    : timeline.duration === 0
      ? .5
      : clampUnit((latestOwnTime - timeline.earliest) / timeline.duration)

  let timeSpan: number | null = null
  if (publicationTimes.length >= 2) {
    const duration = Math.max(...publicationTimes) - Math.min(...publicationTimes)
    timeSpan = Number.isFinite(duration)
      ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, duration))
      : Number.MAX_SAFE_INTEGER
  }

  const density = Math.log1p(datum.question.answerIds.length) / ANSWER_DENSITY_REFERENCE
  return Object.freeze({
    seed: hash / UINT32_RANGE,
    family: FAMILIES[hash % FAMILIES.length],
    answerDensity: clampUnit(density),
    timeSpan,
    freshness,
    divergence: null,
    created,
    collected,
  })
}
