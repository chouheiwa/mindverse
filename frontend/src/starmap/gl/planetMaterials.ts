import type { QuestionPlanetDatum } from '../../domain/universe'
import type { AnswerSatellite } from '../../types'

export type PlanetFamily = 'basalt' | 'strata' | 'cloud' | 'archive'
export type PlanetLod = 'far' | 'medium' | 'near'

export interface PlanetInstanceGroup {
  readonly family: PlanetFamily
  readonly globalIndices: readonly number[]
}

export interface PlanetLocalIndex {
  readonly family: PlanetFamily
  readonly instanceIndex: number
}

export interface PlanetInstanceIndexMap {
  toLocal(globalIndex: number): PlanetLocalIndex | null
  toGlobal(family: PlanetFamily, instanceIndex: number): number | null
}

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

export function planetFamilyIndex(family: PlanetFamily): number {
  return FAMILIES.indexOf(family)
}

export function groupPlanetInstances(inputs: readonly PlanetMaterialInput[]): readonly PlanetInstanceGroup[] {
  const indices = new Map<PlanetFamily, number[]>(FAMILIES.map((family) => [family, []]))
  inputs.forEach((input, globalIndex) => indices.get(input.family)!.push(globalIndex))
  return FAMILIES.flatMap((family) => {
    const globalIndices = indices.get(family)!
    return globalIndices.length === 0
      ? []
      : [Object.freeze({ family, globalIndices: Object.freeze(globalIndices) })]
  })
}

export function planetInstanceIndexMap(
  groups: readonly PlanetInstanceGroup[],
  globalCount: number,
): PlanetInstanceIndexMap {
  const localByGlobal: Array<PlanetLocalIndex | null> = Array.from({ length: globalCount }, () => null)
  const globalByFamily = new Map<PlanetFamily, readonly number[]>()
  for (const group of groups) {
    if (globalByFamily.has(group.family)) throw new Error(`duplicate planet family group: ${group.family}`)
    globalByFamily.set(group.family, group.globalIndices)
    group.globalIndices.forEach((globalIndex, instanceIndex) => {
      if (!Number.isSafeInteger(globalIndex) || globalIndex < 0 || globalIndex >= globalCount) {
        throw new Error(`invalid global planet index: ${globalIndex}`)
      }
      if (localByGlobal[globalIndex] !== null) throw new Error(`duplicate global planet index: ${globalIndex}`)
      localByGlobal[globalIndex] = Object.freeze({ family: group.family, instanceIndex })
    })
  }
  return Object.freeze({
    toLocal(globalIndex: number) {
      return Number.isSafeInteger(globalIndex) && globalIndex >= 0 && globalIndex < localByGlobal.length
        ? localByGlobal[globalIndex]
        : null
    },
    toGlobal(family: PlanetFamily, instanceIndex: number) {
      const globals = globalByFamily.get(family)
      return globals && Number.isSafeInteger(instanceIndex) && instanceIndex >= 0 && instanceIndex < globals.length
        ? globals[instanceIndex]
        : null
    },
  })
}

export function nextPlanetLod(current: PlanetLod, projectedRadiusPx: number): PlanetLod {
  const radius = Number.isFinite(projectedRadiusPx) ? Math.max(0, projectedRadiusPx) : 0
  if (current === 'far') return radius >= 18 ? 'medium' : 'far'
  if (current === 'near') return radius <= 72 ? 'medium' : 'near'
  if (radius < 12) return 'far'
  if (radius >= 84) return 'near'
  return 'medium'
}

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

/** 行星世界半径的上下限，与 gl/bodies.ts 的 PLANET_MIN / PLANET_MAX 同源。 */
export const PLANET_WORLD_MIN = 0.085
export const PLANET_WORLD_MAX = 0.20

/**
 * 行星的世界半径。
 *
 * 两个渲染器必须用同一条式子：镜头距离按轨道半径构图，行星半径一旦不同，
 * 近景里的主体就会大出一整圈 —— 那不是「风格差异」，是同一颗星球被画成了
 * 两个尺寸。
 */
export function planetWorldRadius(answerDensity: number): number {
  const density = Number.isFinite(answerDensity) ? Math.min(1, Math.max(0, answerDensity)) : 0
  return PLANET_WORLD_MIN + (PLANET_WORLD_MAX - PLANET_WORLD_MIN) * density
}
