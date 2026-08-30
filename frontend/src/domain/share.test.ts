// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { indexShareView, parseShareView } from './share'

export const shareFixture = {
  schemaVersion: 'share.v1',
  questions: [{
    id: 'question:7', questionId: '7', title: '真实问题',
    url: 'https://www.zhihu.com/question/7', answerIds: ['answer:8'],
  }],
  answers: [{
    id: 'answer:8', questionId: 'question:7', title: '真实问题',
    url: 'https://www.zhihu.com/question/7/answer/8', authorId: 'author:alice-1',
    authorName: 'Alice', publishedAt: 1, updatedAt: 2, likeCount: 3,
    commentCount: 4, favoriteCount: 5,
  }],
} as const

describe('share.v1 public boundary', () => {
  test('parses the canonical fixture emitted by the Go share DTO', () => {
    const golden = JSON.parse(readFileSync(new URL('../../../internal/share/testdata/share_contract.json', import.meta.url), 'utf8'))
    const parsed = parseShareView(golden)
    expect(parsed).toMatchObject({ schemaVersion: 'share.v1', answers: [{ id: 'answer:8' }] })
    expect(parsed.questions.find(({ id }) => id === 'question:7')).toBeDefined()
    expect(parsed.questions.find(({ id }) => id === 'question:9')?.answerIds).toEqual([])
  })
  test('parses, freezes, and indexes the exact public whitelist', () => {
    const view = parseShareView(structuredClone(shareFixture))
    const index = indexShareView(view)
    expect(index.questionsById.get('question:7')?.answerIds).toEqual(['answer:8'])
    expect(index.answersById.get('answer:8')?.authorName).toBe('Alice')
    expect(Object.isFrozen(view)).toBe(true)
    expect(Object.isFrozen(view.questions[0])).toBe(true)
    expect(() => (index.answersById as unknown as Map<string, unknown>).set('answer:9', {})).toThrow(TypeError)
  })

  test.each([
    ['private root field', (v: Record<string, unknown>) => { v.stars = [] }],
    ['private answer field', (v: Record<string, unknown>) => { (v.answers as Record<string, unknown>[])[0].bindings = [] }],
    ['noncanonical question URL', (v: Record<string, unknown>) => { (v.questions as Record<string, unknown>[])[0].url = 'https://evil.test/question/7' }],
    ['unverified author name', (v: Record<string, unknown>) => { delete (v.answers as Record<string, unknown>[])[0].authorId }],
    ['dangling answer', (v: Record<string, unknown>) => { (v.questions as Record<string, unknown>[])[0].answerIds = ['answer:9'] }],
    ['unsorted questions', (v: Record<string, unknown>) => { v.questions = [
      { id: 'question:9', questionId: '9', title: 'Q9', url: 'https://www.zhihu.com/question/9', answerIds: [] },
      ...(v.questions as unknown[]),
    ] }],
    ['false legacy despite omitempty', (v: Record<string, unknown>) => { v.legacy = false }],
    ['zero omitempty count', (v: Record<string, unknown>) => { (v.answers as Record<string, unknown>[])[0].likeCount = 0 }],
    ['empty omitempty author', (v: Record<string, unknown>) => { (v.answers as Record<string, unknown>[])[0].authorName = '' }],
  ])('fails closed for %s', (_name, mutate) => {
    const changed = structuredClone(shareFixture) as unknown as Record<string, unknown>
    mutate(changed)
    expect(() => parseShareView(changed)).toThrow(/invalid share/)
  })

  test('rejects accessors, sparse arrays, symbols, non-finite numbers, and prototype keys', () => {
    const accessor = structuredClone(shareFixture) as unknown as Record<string, unknown>
    Object.defineProperty(accessor, 'questions', { enumerable: true, get: () => [] })
    expect(() => parseShareView(accessor)).toThrow(/data property/)

    const sparse = structuredClone(shareFixture) as unknown as Record<string, unknown>
    sparse.answers = new Array(1)
    expect(() => parseShareView(sparse)).toThrow(/dense/)

    const symbolic = structuredClone(shareFixture) as unknown as Record<string, unknown>
    Object.defineProperty(symbolic, Symbol('private'), { enumerable: true, value: 1 })
    expect(() => parseShareView(symbolic)).toThrow(/unknown key/)

    const infinite = structuredClone(shareFixture) as unknown as Record<string, unknown>
    ;(infinite.answers as Record<string, unknown>[])[0].likeCount = Infinity
    expect(() => parseShareView(infinite)).toThrow(/finite/)

    const invalidDate = structuredClone(shareFixture) as unknown as Record<string, unknown>
    ;(invalidDate.answers as Record<string, unknown>[])[0].publishedAt = Number.MAX_SAFE_INTEGER
    expect(() => parseShareView(invalidDate)).toThrow(/timestamp/)

    const polluted = structuredClone(shareFixture) as unknown as Record<string, unknown>
    Object.defineProperty((polluted.answers as object[])[0], '__proto__', { enumerable: true, value: { private: true } })
    expect(() => parseShareView(polluted)).toThrow(/unknown key/)
  })

  test('accepts the server legacy tombstone but no legacy content', () => {
    expect(parseShareView({ schemaVersion: 'share.v1', legacy: true, questions: [], answers: [] }).legacy).toBe(true)
    expect(() => parseShareView({ ...structuredClone(shareFixture), legacy: true })).toThrow(/legacy/)
  })

  test('rejects aggregate reference fanout before traversing a hostile payload', () => {
    const questions = Array.from({ length: 26 }, (_, index) => {
      const questionId = String(index + 1)
      return {
        id: `question:${questionId}`, questionId, title: `Q${questionId}`,
        url: `https://www.zhihu.com/question/${questionId}`,
        answerIds: Array<string>(10_000).fill('answer:8'),
      }
    })
    expect(() => parseShareView({ schemaVersion: 'share.v1', questions, answers: [] })).toThrow(/edge budget/)
  })

  test('enforces the Go share.v1 question collection limit', () => {
    const questions = Array.from({ length: 1_001 }, (_, index) => {
      const questionId = String(index + 1).padStart(4, '0').replace(/^0+/, '')
      return { id: `question:${questionId}`, questionId, title: 'Q', url: `https://www.zhihu.com/question/${questionId}`, answerIds: [] }
    })
    expect(() => parseShareView({ schemaVersion: 'share.v1', questions, answers: [] })).toThrow(/question limit/)
  })
})
