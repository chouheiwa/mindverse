import { indexUniverse, type UniverseIndex } from '../domain/universe'
import type { WireAnswerSatellite, WireUniverse } from '../types'

const DAY = 86_400
const OLD_START = Date.UTC(2020, 0, 1) / 1000
const NEW_START = Date.UTC(2024, 0, 1) / 1000

export interface StrataFixtureOptions {
  datedCount?: number
  stableAuthors?: number
  includeUndated?: boolean
  publishedAt?: readonly number[]
  authorIds?: readonly (string | undefined)[]
}

export function makeStrataFixture(options: StrataFixtureOptions = {}): {
  readonly index: UniverseIndex
  readonly answerIds: readonly string[]
  readonly datedAnswerIds: readonly string[]
  readonly authorIds: readonly string[]
} {
  const datedCount = options.publishedAt?.length ?? options.datedCount ?? 12
  const stableAuthors = options.stableAuthors ?? 6
  const includeUndated = options.includeUndated ?? true
  const datedAnswers = Array.from({ length: datedCount }, (_, index): WireAnswerSatellite => {
    const half = Math.ceil(datedCount / 2)
    const withinGroup = index < half ? index : index - half
    const publishedAt = options.publishedAt?.[index]
      ?? (index < half ? OLD_START : NEW_START) + withinGroup * 31 * DAY
    const authorId = options.authorIds?.[index]
      ?? (stableAuthors > 0 ? `author:${index % stableAuthors + 1}` : undefined)
    return {
      id: `answer:${index + 1}`,
      questionId: 'question:7',
      title: `固定答案 ${index + 1}`,
      summary: `当前版本摘要 ${index + 1}`,
      url: `https://www.zhihu.com/question/7/answer/${index + 1}`,
      ...(authorId === undefined ? {} : { authorId, authorName: `作者 ${authorId}` }),
      publishedAt,
      updatedAt: publishedAt + DAY,
      observedAt: NEW_START + 365 * DAY,
      bindings: index === 0
        ? [{ relation: 'created', folders: [] }, { relation: 'collected', folders: ['研究'] }]
        : [],
      discoverySources: index === 0 ? ['own_content'] : ['public_search'],
    }
  })
  const undated: WireAnswerSatellite[] = includeUndated ? [{
    id: 'answer:999',
    questionId: 'question:7',
    title: '未定年答案',
    summary: '当前版本摘要，无合法首发时间',
    url: 'https://www.zhihu.com/question/7/answer/999',
    authorId: 'author:undated',
    authorName: '未定年作者',
    updatedAt: NEW_START,
    observedAt: NEW_START + DAY,
    bindings: [],
    discoverySources: ['public_search'],
  }] : []
  const answers = [...datedAnswers, ...undated]
  const wire: WireUniverse = {
    schemaVersion: 'universe.v1',
    analysisVersion: 'engine.v1',
    meta: {
      items: answers.length, concepts: 1, clusters: 1, own: 1, fav: 1,
      span: [OLD_START, NEW_START], medz: 0, p10z: 0, source: 'strata-test', splits: 0,
    },
    clusters: [{
      g: 0, name: '测试星群', lead: 'Alpha', c: [0, 0, 0], n: answers.length,
      o: 1, f: 1, hue: 218, sat: 70, mem: ['Alpha'],
    }],
    stars: [{
      id: 'star:v1:public:8ed3f6ad685b959e', scope: 'public', externalQueryAllowed: true,
      questionIds: ['question:7'], probeIds: [], c: 'Alpha', g: 0, p: [0, 0, 0],
      n: answers.length, o: 1, f: 1, hue: 218, sat: 70, pe: 1, bu: 0,
      fi: '2020.01', la: '2024.12', ev: [],
    }],
    particles: [], wormholes: [], solo: [], dark: [], nebula: [],
    questions: [{
      id: 'question:7', questionId: '7', title: '固定地层问题',
      url: 'https://www.zhihu.com/question/7', answerIds: answers.map(({ id }) => id).sort(),
    }],
    answers,
    probes: [],
  }
  const index = indexUniverse(wire)
  const authorIds = [...new Set(datedAnswers.flatMap(({ authorId }) => authorId ? [authorId] : []))]
  if (options.publishedAt === undefined && options.authorIds === undefined
      && datedCount === 12 && stableAuthors === 6 && authorIds.length !== 6) {
    throw new Error('strata fixture must contain six distinct dated authors')
  }
  return Object.freeze({
    index,
    answerIds: Object.freeze(answers.map(({ id }) => id)),
    datedAnswerIds: Object.freeze(datedAnswers.map(({ id }) => id)),
    authorIds: Object.freeze(authorIds),
  })
}

export const strataFixture = makeStrataFixture()
