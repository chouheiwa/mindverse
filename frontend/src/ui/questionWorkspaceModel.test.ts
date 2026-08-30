import { describe, expect, test } from 'vitest'
import type { AnswerSatellite, QuestionPlanet, Universe } from '../types'
import type { UniverseIndex } from '../domain/universe'
import { buildQuestionWorkspaceModel, hasUTCYearSpan } from './questionWorkspaceModel'

const day = 86_400

function answer(id: string, overrides: Partial<AnswerSatellite> = {}): AnswerSatellite {
  return {
    id, questionId: 'question:7', title: `回答 ${id}`, url: `https://www.zhihu.com/question/7/answer/${id.split(':')[1]}`,
    bindings: [], discoverySources: [], ...overrides,
  }
}

function index(answers: AnswerSatellite[], answerIds = answers.map((item) => item.id)): UniverseIndex {
  const question: QuestionPlanet = {
    id: 'question:7', questionId: '7', title: '真实问题标题',
    url: 'https://www.zhihu.com/question/7', answerIds,
  }
  return Object.freeze({
    universe: {} as Universe,
    starsById: new Map(), questionsById: new Map([[question.id, question]]),
    answersById: new Map(answers.map((item) => [item.id, item])), probesById: new Map(),
  })
}

describe('buildQuestionWorkspaceModel', () => {
  test('resolves only referenced answers, dedupes stable IDs, and preserves canonical links', () => {
    const a = answer('answer:1')
    const model = buildQuestionWorkspaceModel(index([a, answer('answer:2')], ['answer:1', 'answer:1', 'answer:missing']), 'question:7')
    expect(model.status).toBe('ready')
    if (model.status !== 'ready') return
    expect(model.answers.map(({ id, url }) => ({ id, url }))).toEqual([{ id: 'answer:1', url: a.url }])
    expect(model.answerCount).toBe(1)
  })

  test('admits only true bindings to the personal orbit and keeps both relations and public evidence separate', () => {
    const createdAndCollected = answer('answer:1', {
      bindings: [
        { relation: 'created', folders: [] },
        { relation: 'collected', folders: ['以后读'] },
      ],
      discoverySources: ['public_search', 'favorite_list', 'own_content'],
    })
    const discoveredOnly = answer('answer:2', { discoverySources: ['favorite_list', 'own_content'] })
    const model = buildQuestionWorkspaceModel(index([createdAndCollected, discoveredOnly]), 'question:7')
    expect(model.status).toBe('ready')
    if (model.status !== 'ready') return
    expect(model.personal?.items).toHaveLength(1)
    expect(model.personal?.items[0].relations).toEqual(['created', 'collected'])
    expect(model.personal?.items[0].publicEvidence).toEqual(['public_search', 'favorite_list', 'own_content'])
    expect('publicEvidence' in model.answers[1] && model.answers[1].publicEvidence).toEqual(['favorite_list', 'own_content'])
  })

  test.each([{ shared: true }, { readOnly: true }])('removes all binding-derived data from every public model branch %o', (options) => {
    const source = answer('answer:1', {
      summary: 'PRIVATE_SUMMARY_SENTINEL', authorName: 'ORPHAN_AUTHOR_SENTINEL', observedAt: 1_700_000_003,
      bindings: [
        { relation: 'created', at: 1_700_000_001, folders: ['PRIVATE_FOLDER_SENTINEL'] },
        { relation: 'collected', at: 1_700_000_002, folders: ['SECOND_PRIVATE_FOLDER'] },
      ],
      discoverySources: ['public_search', 'favorite_list', 'own_content'],
    })
    const before = structuredClone(source)
    const model = buildQuestionWorkspaceModel(index([source]), 'question:7', options)
    expect(model.status).toBe('ready')
    if (model.status !== 'ready') return
    expect(Object.hasOwn(model, 'personal')).toBe(false)
    const serialized = JSON.stringify(model)
    expect(serialized).not.toContain('relations')
    expect(serialized).not.toContain('folders')
    expect(serialized).not.toContain('created')
    expect(serialized).not.toContain('collected')
    expect(serialized).not.toContain('PRIVATE_FOLDER_SENTINEL')
    expect(serialized).not.toContain('SECOND_PRIVATE_FOLDER')
    expect(serialized).not.toContain('1700000001')
    expect(serialized).not.toContain('1700000002')
    expect(serialized).not.toContain('1700000003')
    expect(serialized).not.toContain('PRIVATE_SUMMARY_SENTINEL')
    expect(serialized).not.toContain('ORPHAN_AUTHOR_SENTINEL')
    expect(serialized).not.toContain('public_search')
    expect(serialized).not.toContain('favorite_list')
    expect(serialized).not.toContain('own_content')
    expect(source).toEqual(before)
  })

  test('public answers match the backend whitelist while private answers retain legitimate evidence', () => {
    const source = answer('answer:1', {
      summary: '私人摘要', authorId: 'author:alice', authorName: 'Alice', publishedAt: 10, updatedAt: 20,
      observedAt: 30, likeCount: 4, commentCount: 5, favoriteCount: 6,
      bindings: [{ relation: 'collected', at: 40, folders: ['资料'] }], discoverySources: ['favorite_list'],
    })
    const publicModel = buildQuestionWorkspaceModel(index([source]), 'question:7', { shared: true })
    expect(publicModel.status).toBe('ready')
    if (publicModel.status !== 'ready') return
    expect(publicModel.answers[0]).toEqual({
      id: 'answer:1', questionId: 'question:7', title: '回答 answer:1', url: source.url,
      authorId: 'author:alice', authorName: 'Alice', publishedAt: 10, updatedAt: 20,
      likeCount: 4, commentCount: 5, favoriteCount: 6,
    })
    const privateModel = buildQuestionWorkspaceModel(index([source]), 'question:7')
    expect(privateModel.status).toBe('ready')
    if (privateModel.status !== 'ready') return
    expect(JSON.stringify(privateModel)).toContain('私人摘要')
    expect(JSON.stringify(privateModel)).toContain('favorite_list')
    expect(privateModel.personal?.items[0]).toMatchObject({ relations: ['collected'], folders: ['资料'] })
  })

  test('uses only positive publishedAt values for exact chronicle thresholds', () => {
    const start = 1_600_000_000
    const answers = Array.from({ length: 12 }, (_, i) => answer(`answer:${String(i + 1).padStart(2, '0')}`, {
      authorId: `author:${i % 3}`, authorName: `作者 ${i % 3}`,
      publishedAt: start + (i === 11 ? 3 * 365 * day : i * day),
      updatedAt: start + 20 * 365 * day, observedAt: start + 30 * 365 * day,
    }))
    const available = buildQuestionWorkspaceModel(index(answers), 'question:7')
    expect(available.status).toBe('ready')
    if (available.status !== 'ready') return
    expect(available.chronicle.status).toBe('available')
    expect(available.chronicle.actual).toEqual({ eligibleAnswers: 12, stableAuthors: 3, spanDays: 1095 })

    const invalid = answers.map((item, i) => i === 11
      ? { ...item, publishedAt: 0, updatedAt: start + 40 * 365 * day, observedAt: start + 50 * 365 * day }
      : { ...item, authorId: undefined, authorName: `可见名字 ${i}` })
    const insufficient = buildQuestionWorkspaceModel(index(invalid), 'question:7')
    expect(insufficient.status).toBe('ready')
    if (insufficient.status !== 'ready') return
    expect(insufficient.chronicle.status).toBe('insufficient')
    expect(insufficient.chronicle.actual).toEqual({ eligibleAnswers: 11, stableAuthors: 0, spanDays: 10 })
    expect(insufficient.chronicle.flatItems).toHaveLength(12)
    expect(Object.hasOwn(insufficient.chronicle, 'strata')).toBe(false)
    expect(Object.hasOwn(insufficient.chronicle, 'layers')).toBe(false)
  })

  test('requires three actual UTC calendar years instead of a fixed day count', () => {
    const utc = (value: string) => Date.parse(value + 'T00:00:00Z') / 1000
    expect(hasUTCYearSpan(utc('2019-03-01'), utc('2022-02-28'), 3)).toBe(false)
    expect(hasUTCYearSpan(utc('2019-03-01'), utc('2022-03-01'), 3)).toBe(true)
    expect(hasUTCYearSpan(utc('2020-02-29'), utc('2023-02-27'), 3)).toBe(false)
    expect(hasUTCYearSpan(utc('2020-02-29'), utc('2023-02-28'), 3)).toBe(true)

    const buildAt = (last: string) => {
      const start = utc('2019-03-01')
      const end = utc(last)
      return buildQuestionWorkspaceModel(index(Array.from({ length: 12 }, (_, i) => answer(`answer:${i + 1}`, {
        authorId: `author:${i % 3}`, publishedAt: i === 11 ? end : start + i,
      }))), 'question:7')
    }
    const short = buildAt('2022-02-28')
    const exact = buildAt('2022-03-01')
    expect(short.status === 'ready' && short.chronicle.status).toBe('insufficient')
    expect(exact.status === 'ready' && exact.chronicle.status).toBe('available')
  })

  test('builds only a survivor-biased retrospective list at the exact threshold', () => {
    const start = 1_600_000_000
    const answers = Array.from({ length: 12 }, (_, i) => answer(`answer:${12 - i}`, {
      authorId: `author:${i % 3}`, publishedAt: start + i * (3 * 365 * day / 11),
    }))
    const model = buildQuestionWorkspaceModel(index(answers), 'question:7')
    expect(model.status).toBe('ready')
    if (model.status !== 'ready' || model.chronicle.status !== 'available') return
    expect(model.chronicle.kind).toBe('retrospective_container_timeline')
    expect(model.chronicle.flatItems.map((item) => item.id)).toEqual(
      [...model.chronicle.flatItems].sort((left, right) =>
        left.publishedAt! - right.publishedAt! || left.id.localeCompare(right.id)).map((item) => item.id),
    )
    expect(model.chronicle.disclaimer).toContain('当前仍可访问的答案按首发时间排列，不代表当年观点或社区份额')
    expect(model.chronicle.disclaimer).toMatch(/幸存者偏差/)
    expect(model.chronicle.disclaimer).toMatch(/版本偏差/)
    expect(Object.hasOwn(model.chronicle, 'shares')).toBe(false)
    expect(Object.hasOwn(model.chronicle, 'turningPoints')).toBe(false)
    expect(Object.hasOwn(model.chronicle, 'layers')).toBe(false)
  })

  test('always abstains from prism claims and deeply freezes output', () => {
    const model = buildQuestionWorkspaceModel(index([answer('answer:1', {
      bindings: [{ relation: 'created', folders: ['资料'] }], discoverySources: ['public_search'],
    })]), 'question:7')
    expect(model.status).toBe('ready')
    if (model.status !== 'ready') return
    expect(model.prism).toEqual({ status: 'abstained', reason: '证据不足，暂不生成观点结构', claims: [] })
    expect(Object.isFrozen(model)).toBe(true)
    expect(Object.isFrozen(model.answers)).toBe(true)
    expect(Object.isFrozen(model.personal?.items[0].relations)).toBe(true)
    expect(Object.isFrozen(model.personal?.items[0].folders)).toBe(true)
  })

  test('returns a clear immutable error for an unknown question', () => {
    const model = buildQuestionWorkspaceModel(index([]), 'question:404')
    expect(model).toEqual({ status: 'error', code: 'question_not_found', message: '未找到这个问题，无法建立问题工作台。' })
    expect(Object.isFrozen(model)).toBe(true)
  })
})
