// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import type { CurrentUniverse, LegacyUniverse } from '../types'
import {
  indexUniverse,
  parseUniverse,
  probesForStar,
  publicStarsForShare,
  questionsForStar,
} from './universe'

const evidence = { t: 'private evidence', u: 'https://example.test/private', o: 1, y: '26.08' }

const fixture: CurrentUniverse = {
  schemaVersion: 'universe.v1',
  analysisVersion: 'engine.v1',
  meta: { items: 2, concepts: 2, clusters: 1, own: 2, fav: 0, span: [1, 2], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [{ g: 0, name: 'Cluster', lead: 'Alpha', c: [0, 0, 0], n: 2, o: 2, f: 0, hue: 218, sat: 0, mem: ['Alpha', 'Beta'] }],
  stars: [
    { id: 'star:v1:private:alpha', scope: 'private', externalQueryAllowed: false, questionIds: ['question:7'], probeIds: ['article:21'], c: 'Alpha', g: 0, p: [0, 0, 0], n: 1, o: 1, f: 0, hue: 218, sat: 0, pe: 1, bu: 0, fi: '2026.01', la: '2026.02', ev: [evidence] },
    { id: 'star:v1:private:beta', scope: 'private', externalQueryAllowed: false, questionIds: ['question:7'], probeIds: ['article:21', 'article:22'], c: 'Beta', g: 0, p: [1, 1, 1], n: 1, o: 1, f: 0, hue: 218, sat: 0, pe: 1, bu: 0, fi: '2026.01', la: '2026.02', ev: [evidence] },
  ],
  particles: [[0, 0, 0, 0, 1]],
  wormholes: [], solo: [], dark: [], nebula: [],
  questions: [{ id: 'question:7', questionId: '7', title: 'Question', url: 'https://www.zhihu.com/question/7', answerIds: ['answer:8'] }],
  answers: [{ id: 'answer:8', questionId: 'question:7', title: 'Question', summary: 'Summary', url: 'https://www.zhihu.com/question/7/answer/8', authorId: 'author:alice', authorName: 'Alice', publishedAt: 1, updatedAt: 2, observedAt: 3, likeCount: 4, commentCount: 5, favoriteCount: 6, bindings: [{ relation: 'created', at: 1, folders: [] }], discoverySources: ['own_content'] }],
  probes: [
    { id: 'article:21', title: 'Probe 21', summary: 'Summary', url: 'https://zhuanlan.zhihu.com/p/21', authorId: 'author:alice', authorName: 'Alice', publishedAt: 1, updatedAt: 2, observedAt: 3, likeCount: 4, commentCount: 5, favoriteCount: 6, bindings: [{ relation: 'collected', at: 2, folders: ['Reading'] }], discoverySources: ['favorite_list'] },
    { id: 'article:22', title: 'Probe 22', summary: '', url: 'https://zhuanlan.zhihu.com/p/22', authorId: '', authorName: '', publishedAt: 0, updatedAt: 0, observedAt: 0, likeCount: 0, commentCount: 0, favoriteCount: 0, bindings: [], discoverySources: ['public_search'] },
  ],
}

const clone = <T>(value: T): T => structuredClone(value)

describe('current universe indexes', () => {
  test('two stars resolve one global question to the same object identity', () => {
    const index = indexUniverse(fixture)
    expect(questionsForStar(index, fixture.stars[0])[0]).toBe(questionsForStar(index, fixture.stars[1])[0])
  })

  test('probes resolve uniquely in deterministic reference order', () => {
    const parsed = parseUniverse(clone(fixture))
    if (parsed.schemaVersion !== 'universe.v1') throw new Error('expected current universe')
    expect(probesForStar(indexUniverse(parsed), parsed.stars[1]).map((probe) => probe.id)).toEqual(['article:21', 'article:22'])
  })

  test('private stars stay in the personal index but never enter share selectors', () => {
    const index = indexUniverse(fixture)
    expect([...index.starsById.values()]).toEqual(fixture.stars)
    expect(publicStarsForShare(index)).toEqual([])
  })
})

describe('compatibility and validation', () => {
  test('legacy data is read-only safe and never synthesizes public objects from evidence', () => {
    const { schemaVersion: _schema, analysisVersion: _analysis, questions: _questions, answers: _answers, probes: _probes, ...legacyShape } = fixture
    const legacyStars = legacyShape.stars.map(({ id: _id, scope: _scope, externalQueryAllowed: _allowed, questionIds: _questionIds, probeIds: _probeIds, ...star }) => star)
    const legacy = parseUniverse({ ...legacyShape, stars: legacyStars })
    expect(legacy.schemaVersion).toBeUndefined()
    const index = indexUniverse(legacy as LegacyUniverse)
    expect(index.questionsById.size).toBe(0)
    expect(index.probesById.size).toBe(0)
    expect(questionsForStar(index, legacy.stars[0])).toEqual([])
    expect(probesForStar(index, legacy.stars[0])).toEqual([])
  })

  test.each([
    ['duplicate question', (u: CurrentUniverse) => { u.questions.push(clone(u.questions[0])) }],
    ['missing question reference', (u: CurrentUniverse) => { u.stars[0].questionIds = ['question:999'] }],
    ['duplicate probe reference', (u: CurrentUniverse) => { u.stars[0].probeIds = ['article:21', 'article:21'] }],
    ['unsupported schema', (u: CurrentUniverse) => { (u as { schemaVersion: string }).schemaVersion = 'universe.v2' }],
    ['unsupported relation', (u: CurrentUniverse) => { (u.answers[0].bindings![0] as { relation: string }).relation = 'followed' }],
    ['unsupported discovery source', (u: CurrentUniverse) => { (u.probes[0].discoverySources as string[])[0] = 'scraped' }],
  ])('rejects %s', (_name, mutate) => {
    const changed = clone(fixture)
    mutate(changed)
    expect(() => parseUniverse(changed)).toThrow()
  })
})

test('the Go golden contract parses every public field and remains JSON-compatible', () => {
  const path = new URL('../../../internal/engine/testdata/universe_contract.json', import.meta.url)
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'))
  const parsed = parseUniverse(raw)
  if (parsed.schemaVersion !== 'universe.v1') throw new Error('expected current golden universe')

  expect(new Set(parsed.stars.map((star) => star.scope))).toEqual(new Set(['private', 'public']))
  expect(new Set(parsed.answers.flatMap((answer) => (answer.bindings ?? []).map((binding) => binding.relation)))).toEqual(new Set(['created', 'collected']))
  expect(new Set(parsed.answers.flatMap((answer) => answer.discoverySources ?? []))).toEqual(new Set(['favorite_list', 'own_content', 'public_search']))
  expect(parsed.questions[0]).toMatchObject({ id: 'question:7', questionId: '7', title: 'Question', url: expect.any(String), answerIds: ['answer:8'] })
  expect(parsed.answers[0]).toMatchObject({ id: 'answer:8', questionId: 'question:7', title: 'Question', summary: 'Answer summary', url: expect.any(String), authorId: 'author:alice', authorName: 'Alice', publishedAt: 100, updatedAt: 120, observedAt: 140, likeCount: 1, commentCount: 2, favoriteCount: 3, bindings: expect.any(Array), discoverySources: expect.any(Array) })
  expect(parsed.probes[0]).toMatchObject({ id: 'article:21', title: 'Article', summary: 'Article summary', url: expect.any(String), authorId: 'author:bob', authorName: 'Bob', publishedAt: 200, updatedAt: 220, observedAt: 240, likeCount: 4, commentCount: 5, favoriteCount: 6, bindings: expect.any(Array), discoverySources: expect.any(Array) })
  const goldenEntities = raw as { questions: unknown; answers: unknown; probes: unknown }
  expect({ questions: parsed.questions, answers: parsed.answers, probes: parsed.probes }).toEqual({
    questions: goldenEntities.questions,
    answers: goldenEntities.answers,
    probes: goldenEntities.probes,
  })
  expect(JSON.parse(JSON.stringify(parsed))).toMatchObject({ schemaVersion: 'universe.v1', analysisVersion: 'engine.v1' })
})
