// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import type { CurrentUniverse, LegacyUniverse, WireSolo } from '../types'
import {
  indexUniverse,
  parseUniverse,
  probesForStar,
  publicStarsForShare,
  questionsForStar,
} from './universe'

const evidence = { t: 'private evidence', u: 'https://example.test/private', o: 1, y: '26.08' }

const fixture = {
  schemaVersion: 'universe.v1',
  analysisVersion: 'engine.v1',
  meta: { items: 2, concepts: 2, clusters: 1, own: 2, fav: 0, span: [1, 2], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [{ g: 0, name: 'Cluster', lead: 'Alpha', c: [0, 0, 0], n: 2, o: 2, f: 0, hue: 218, sat: 0, mem: ['Alpha', 'Beta'] }],
  stars: [
    { id: 'star:v1:private:8ed3f6ad685b959e', scope: 'private', externalQueryAllowed: false, questionIds: ['question:7'], probeIds: ['article:21'], c: 'Alpha', g: 0, p: [0, 0, 0], n: 1, o: 1, f: 0, hue: 218, sat: 0, pe: 1, bu: 0, fi: '2026.01', la: '2026.02', ev: [evidence] },
    { id: 'star:v1:private:f44e64e75f3948e9', scope: 'private', externalQueryAllowed: false, questionIds: ['question:7'], probeIds: ['article:21', 'article:22'], c: 'Beta', g: 0, p: [1, 1, 1], n: 1, o: 1, f: 0, hue: 218, sat: 0, pe: 1, bu: 0, fi: '2026.01', la: '2026.02', ev: [evidence] },
  ],
  particles: [[0, 0, 0, 0, 1]],
  wormholes: [], solo: [], dark: [], nebula: [],
  questions: [{ id: 'question:7', questionId: '7', title: 'Question', url: 'https://www.zhihu.com/question/7', answerIds: ['answer:8'] }],
  answers: [{ id: 'answer:8', questionId: 'question:7', title: 'Question', summary: 'Summary', url: 'https://www.zhihu.com/question/7/answer/8', authorId: 'author:alice', authorName: 'Alice', publishedAt: 1, updatedAt: 2, observedAt: 3, likeCount: 4, commentCount: 5, favoriteCount: 6, bindings: [{ relation: 'created', at: 1, folders: [] }], discoverySources: ['own_content'] }],
  probes: [
    { id: 'article:21', title: 'Probe 21', summary: 'Summary', url: 'https://zhuanlan.zhihu.com/p/21', authorId: 'author:alice', authorName: 'Alice', publishedAt: 1, updatedAt: 2, observedAt: 3, likeCount: 4, commentCount: 5, favoriteCount: 6, bindings: [{ relation: 'collected', at: 2, folders: ['Reading'] }], discoverySources: ['favorite_list'] },
    { id: 'article:22', title: 'Probe 22', summary: '', url: 'https://zhuanlan.zhihu.com/p/22', authorId: '', authorName: '', publishedAt: 0, updatedAt: 0, observedAt: 0, likeCount: 0, commentCount: 0, favoriteCount: 0, bindings: [], discoverySources: ['public_search'] },
  ],
} satisfies CurrentUniverse

const clone = <T>(value: T): T => structuredClone(value)
const expectKeys = (value: object, keys: readonly string[]) =>
  expect(Object.keys(value).sort()).toEqual([...keys].sort())

describe('current universe indexes', () => {
  test('two stars resolve one global question to the same object identity', () => {
    const index = indexUniverse(fixture)
    expect(questionsForStar(index, fixture.stars[0])[0]).toBe(questionsForStar(index, fixture.stars[1])[0])
  })

  test('probes resolve uniquely in deterministic reference order', () => {
    const parsed = parseUniverse(clone(fixture))
    if (parsed.schemaVersion !== 'universe.v1') throw new Error('expected current universe')
    expect(probesForStar(indexUniverse(parsed), parsed.stars![1]).map((probe) => probe.id)).toEqual(['article:21', 'article:22'])
  })

  test('private stars stay in the personal index but never enter share selectors', () => {
    const index = indexUniverse(fixture)
    expect([...index.starsById.values()]).toEqual(fixture.stars)
    expect(publicStarsForShare(index)).toEqual([])
  })

  test('index owns deeply frozen data and exposes no mutable Map surface', () => {
    const input = clone(fixture)
    const index = indexUniverse(input)
    const star = index.starsById.get('star:v1:private:8ed3f6ad685b959e')!
    const selected = questionsForStar(index, star)

    input.questions[0].title = 'caller mutation'
    input.stars[0].questionIds[0] = 'question:999'
    expect(() => (index.questionsById as Map<string, unknown>).set('question:999', {})).toThrow(TypeError)
    expect(() => { (selected[0] as { title: string }).title = 'selected mutation' }).toThrow(TypeError)
    expect(() => { star.questionIds.push('question:999') }).toThrow(TypeError)

    expect(Object.isFrozen(selected)).toBe(true)
    expect(index.questionsById.get('question:7')?.title).toBe('Question')
    expect(questionsForStar(index, star)[0]).toBe(selected[0])
    expect(index.questionsById.has('question:999')).toBe(false)
  })

  test('freezes the index shell and shares one frozen empty selector result', () => {
    const index = indexUniverse(fixture)
    const emptyQuestions = questionsForStar(index, { ...fixture.stars[0], questionIds: [] })
    const emptyProbes = probesForStar(index, { ...fixture.stars[0], probeIds: [] })
    expect(Object.isFrozen(index)).toBe(true)
    expect(emptyQuestions).toBe(emptyProbes)
    expect(Object.isFrozen(emptyQuestions)).toBe(true)
    expect(() => (emptyQuestions as unknown[]).push({})).toThrow(TypeError)
    expect(() => { (index as { universe: unknown }).universe = null }).toThrow(TypeError)
    expect(index.universe.meta.items).toBe(2)
  })

  test('does not reparse or reclone a validated wire before indexing', () => {
    const cloneSpy = vi.spyOn(globalThis, 'structuredClone')
    const parsed = parseUniverse(fixture)
    expect(cloneSpy).toHaveBeenCalledTimes(1)
    indexUniverse(parsed)
    expect(cloneSpy).toHaveBeenCalledTimes(1)
    cloneSpy.mockRestore()
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
    const questions = questionsForStar(index, legacy.stars![0])
    const probes = probesForStar(index, legacy.stars![0])
    expect(questions).toBe(probes)
    expect(Object.isFrozen(questions)).toBe(true)
  })

  test('legacy rejects stars carrying current-only markers after versions and entities are stripped', () => {
    const current = clone(fixture) as Record<string, unknown>
    delete current.schemaVersion
    delete current.analysisVersion
    delete current.questions
    delete current.answers
    delete current.probes
    expect(() => parseUniverse(current)).toThrow(/stars/)
  })

  test.each([
    ['root', (u: Record<string, unknown>) => { u.extra = true }],
    ['meta', (u: Record<string, unknown>) => {
      Object.defineProperty(u.meta as object, 'constructor', { value: 'pollute', enumerable: true })
    }],
    ['star', (u: Record<string, unknown>) => { ((u.stars as Record<string, unknown>[])[0]).questionID = 'renamed' }],
    ['evidence', (u: Record<string, unknown>) => {
      const ev = (((u.stars as Record<string, unknown>[])[0]).ev as Record<string, unknown>[])[0]
      Object.defineProperty(ev, '__proto__', { value: 'pollute', enumerable: true })
    }],
    ['cluster', (u: Record<string, unknown>) => { ((u.clusters as Record<string, unknown>[])[0]).extra = true }],
    ['question', (u: Record<string, unknown>) => { ((u.questions as Record<string, unknown>[])[0]).titel = 'renamed' }],
    ['answer', (u: Record<string, unknown>) => { ((u.answers as Record<string, unknown>[])[0]).extra = true }],
    ['binding', (u: Record<string, unknown>) => { (((u.answers as Record<string, unknown>[])[0]).bindings as Record<string, unknown>[])[0].extra = true }],
    ['probe', (u: Record<string, unknown>) => { ((u.probes as Record<string, unknown>[])[0]).extra = true }],
    ['wormhole', (u: Record<string, unknown>) => {
      u.wormholes = [{ a: 0, b: 1, an: 'A', bn: 'B', obs: 1, exp: 1.5, z: -2, ev: [], extra: true }]
    }],
    ['wormhole evidence', (u: Record<string, unknown>) => {
      u.wormholes = [{ a: 0, b: 1, an: 'A', bn: 'B', obs: 1, exp: 1.5, z: -2, ev: [{ t: 'T', u: 'https://example.test', a: 'A', b: 'B', extra: true }] }]
    }],
    ['solo', (u: Record<string, unknown>) => {
      u.solo = [{ c: 'C', n: 1, t: 'T', u: 'https://example.test', g: [], p: [0, 0, 0], extra: true }]
    }],
    ['dark', (u: Record<string, unknown>) => {
      u.dark = [{ c: 'C', n: 1, f: 0, o: 1, gap: 1, first: 'A', last: 'B', ev: [], extra: true }]
    }],
    ['nebula', (u: Record<string, unknown>) => {
      u.nebula = [{ c: 'C', n: 1, burst: 0.5, first: 'A', last: 'B', extra: true }]
    }],
  ])('rejects unknown keys on %s objects', (_name, mutate) => {
    const changed = clone(fixture) as unknown as Record<string, unknown>
    mutate(changed)
    expect(() => parseUniverse(changed)).toThrow(/unknown key/)
  })

  test('rejects missing required nested keys', () => {
    const changed = clone(fixture) as unknown as Record<string, unknown>
    delete ((changed.questions as Record<string, unknown>[])[0]).title
    expect(() => parseUniverse(changed)).toThrow(/missing required key title/)
  })

  test('rejects accessors because they are not JSON data properties', () => {
    const changed = clone(fixture) as CurrentUniverse
    Object.defineProperty(changed.meta, 'items', { get: () => 2, enumerable: true })
    expect(() => parseUniverse(changed)).toThrow(/JSON data property/)
  })

  test.each([
    ['fractional meta int', (u: CurrentUniverse) => { u.meta.items = 1.5 }],
    ['fractional star int', (u: CurrentUniverse) => { u.stars![0].n = 1.5 }],
    ['fractional evidence int', (u: CurrentUniverse) => { u.stars![0].ev![0].o = 0.5 }],
    ['fractional cluster int', (u: CurrentUniverse) => { u.clusters![0].g = 0.5 }],
    ['fractional timestamp', (u: CurrentUniverse) => { u.answers![0].publishedAt = 1.5 }],
    ['fractional binding time', (u: CurrentUniverse) => { u.answers![0].bindings![0].at = 1.5 }],
    ['malformed author ID', (u: CurrentUniverse) => { u.answers![0].authorId = 'author:alice/evil' }],
    ['negative public count', (u: CurrentUniverse) => { u.probes![0].likeCount = -1 }],
    ['wrong stable star hash', (u: CurrentUniverse) => { u.stars![0].id = 'star:v1:private:0000000000000000' }],
  ])('matches Go validation for %s', (_name, mutate) => {
    const changed = clone(fixture) as CurrentUniverse
    mutate(changed)
    expect(() => parseUniverse(changed)).toThrow()
  })

  test('stable IDs use Go whitespace normalization and ASCII-only lowercase', () => {
    const changed = clone(fixture) as CurrentUniverse
    changed.stars![0].c = ' \tAlPHA\n '
    expect(() => parseUniverse(changed)).not.toThrow()
  })

  test('caps collection sizes before walking attacker-controlled input', () => {
    const changed = clone(fixture) as CurrentUniverse
    changed.questions = Array.from({ length: 10_001 }, () => changed.questions![0])
    expect(() => parseUniverse(changed)).toThrow(/limit/)
  })

  test('rejects sparse arrays', () => {
    const changed = clone(fixture) as CurrentUniverse
    changed.questions = new Array(1)
    expect(() => parseUniverse(changed)).toThrow(/dense own data properties/)
  })

  test('rejects array accessors without executing their getters', () => {
    const changed = clone(fixture) as CurrentUniverse
    let reads = 0
    Object.defineProperty(changed.questions, '0', {
      enumerable: true,
      get: () => {
        reads += 1
        return fixture.questions[0]
      },
    })
    expect(() => parseUniverse(changed)).toThrow(/JSON data property/)
    expect(reads).toBe(0)
  })

  test.each(['symbol', 'custom'])('rejects arrays with %s own properties', (kind) => {
    const changed = clone(fixture) as CurrentUniverse
    if (kind === 'symbol') {
      Object.defineProperty(changed.questions, Symbol('extra'), { value: true, enumerable: true })
    } else {
      Object.defineProperty(changed.questions, 'extra', { value: true, enumerable: true })
    }
    expect(() => parseUniverse(changed)).toThrow(/unknown array key/)
  })

  test('wire parsing preserves nullable legacy slices and omitted current star references', () => {
    const legacy = parseUniverse({
      meta: fixture.meta,
      clusters: null,
      stars: null,
      particles: null,
      wormholes: null,
      solo: null,
      dark: null,
      nebula: null,
    })
    expect(legacy.clusters).toBeNull()
    expect(legacy.stars).toBeNull()

    const current = clone(fixture) as CurrentUniverse
    delete current.stars![0].questionIds
    delete current.stars![0].probeIds
    current.wormholes = null
    const parsed = parseUniverse(current)
    if (parsed.schemaVersion !== 'universe.v1') throw new Error('expected current universe')
    expect(parsed.wormholes).toBeNull()
    expect('questionIds' in parsed.stars![0]).toBe(false)
    expect('probeIds' in parsed.stars![0]).toBe(false)
  })

  test('omitted discovery sources roundtrip absent and normalize to frozen empty arrays', () => {
    const current = clone(fixture) as CurrentUniverse
    delete current.answers![0].discoverySources
    delete current.probes![0].discoverySources

    const parsed = parseUniverse(current)
    if (parsed.schemaVersion !== 'universe.v1') throw new Error('expected current universe')
    expect('discoverySources' in parsed.answers![0]).toBe(false)
    expect('discoverySources' in parsed.probes![0]).toBe(false)
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(current)

    const index = indexUniverse(parsed)
    const answerSources = index.answersById.get('answer:8')!.discoverySources
    const probeSources = index.probesById.get('article:21')!.discoverySources
    expect(answerSources).toEqual([])
    expect(probeSources).toEqual([])
    expect(Object.isFrozen(answerSources)).toBe(true)
    expect(Object.isFrozen(probeSources)).toBe(true)
  })

  test('nullable wire Solo clusters roundtrip as null and normalize to a frozen empty array', () => {
    const nullableSolo: WireSolo = {
      c: 'Edge',
      n: 1,
      t: 'Edge case',
      u: 'https://example.test/edge',
      g: null,
      p: [1, 2, 3],
    }
    const current = { ...clone(fixture), solo: [nullableSolo] }
    const parsed = parseUniverse(current)
    expect(parsed.solo![0].g).toBeNull()
    expect(JSON.parse(JSON.stringify(parsed))).toEqual(current)

    const normalizedSolo = indexUniverse(parsed).universe.solo[0]
    expect(normalizedSolo.g).toEqual([])
    expect(Object.isFrozen(normalizedSolo.g)).toBe(true)
  })

  test.each([
    ['duplicate question', (u: CurrentUniverse) => { u.questions!.push(clone(u.questions![0])) }],
    ['missing question reference', (u: CurrentUniverse) => { u.stars![0].questionIds = ['question:999'] }],
    ['duplicate probe reference', (u: CurrentUniverse) => { u.stars![0].probeIds = ['article:21', 'article:21'] }],
    ['unsupported schema', (u: CurrentUniverse) => { (u as { schemaVersion: string }).schemaVersion = 'universe.v2' }],
    ['unsupported relation', (u: CurrentUniverse) => { (u.answers![0].bindings![0] as { relation: string }).relation = 'followed' }],
    ['unsupported discovery source', (u: CurrentUniverse) => { (u.probes![0].discoverySources as string[])[0] = 'scraped' }],
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

  expect(new Set(parsed.stars!.map((star) => star.scope))).toEqual(new Set(['private', 'public']))
  expect(new Set(parsed.answers!.flatMap((answer) => (answer.bindings ?? []).map((binding) => binding.relation)))).toEqual(new Set(['created', 'collected']))
  expect(new Set(parsed.answers!.flatMap((answer) => answer.discoverySources ?? []))).toEqual(new Set(['favorite_list', 'own_content', 'public_search']))
  expect(parsed.wormholes).toBeNull()
  expect(parsed.stars![1].ev).toBeNull()
  expectKeys(parsed, ['schemaVersion', 'analysisVersion', 'meta', 'clusters', 'stars', 'particles', 'wormholes', 'solo', 'dark', 'nebula', 'questions', 'answers', 'probes'])
  expectKeys(parsed.meta, ['items', 'concepts', 'clusters', 'own', 'fav', 'span', 'medz', 'p10z', 'source', 'splits'])
  expectKeys(parsed.clusters![0], ['g', 'name', 'lead', 'c', 'n', 'o', 'f', 'hue', 'sat', 'mem'])
  expectKeys(parsed.stars![0], ['id', 'scope', 'externalQueryAllowed', 'questionIds', 'probeIds', 'c', 'g', 'p', 'n', 'o', 'f', 'hue', 'sat', 'pe', 'bu', 'fi', 'la', 'ev'])
  expectKeys(parsed.stars![0].ev![0], ['t', 'u', 'o', 'y'])
  expectKeys(parsed.questions![0], ['id', 'questionId', 'title', 'url', 'answerIds'])
  expectKeys(parsed.answers![0], ['id', 'questionId', 'title', 'summary', 'url', 'authorId', 'authorName', 'publishedAt', 'updatedAt', 'observedAt', 'likeCount', 'commentCount', 'favoriteCount', 'bindings', 'discoverySources'])
  expectKeys(parsed.answers![0].bindings![0], ['relation', 'at', 'folders'])
  expectKeys(parsed.probes![0], ['id', 'title', 'summary', 'url', 'authorId', 'authorName', 'publishedAt', 'updatedAt', 'observedAt', 'likeCount', 'commentCount', 'favoriteCount', 'bindings', 'discoverySources'])
  expect(typeof parsed.meta.items).toBe('number')
  expect(Number.isSafeInteger(parsed.answers![0].publishedAt)).toBe(true)
  expect(JSON.parse(JSON.stringify(parsed))).toEqual(raw)

  const withUnknown = structuredClone(raw) as Record<string, unknown>
  withUnknown.unknown = true
  expect(() => parseUniverse(withUnknown)).toThrow(/unknown key/)
})
