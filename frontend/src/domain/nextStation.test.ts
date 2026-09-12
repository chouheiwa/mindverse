import { describe, expect, test } from 'vitest'
import { nextStationAfter } from './nextStation'
import { indexUniverse } from './universe'
import type { CurrentUniverse } from '../types'

// 「看见自己在往哪走」：站在一个问题上，看见自己接着去了哪里。下一站 = 你在这个
// 问题上最后一次痕迹之后，最早留下痕迹的另一个问题。
const at = (year: number, month: number) => Math.floor(Date.UTC(year, month - 1, 15) / 1000)
const answer = (id: string, questionId: string, bindings: { relation: 'created' | 'collected'; at?: number }[]) => ({
  id, questionId, title: 'Q', summary: '', url: `https://www.zhihu.com/question/${questionId.split(':')[1]}/answer/${id.split(':')[1]}`,
  authorId: 'author:x', authorName: '', publishedAt: at(2024, 1), updatedAt: at(2024, 1), observedAt: at(2024, 1),
  likeCount: 0, commentCount: 0, favoriteCount: 0, discoverySources: ['public_search'],
  bindings: bindings.map((binding) => ({ ...binding, folders: [] })),
})
const star = (id: string, name: string, questionIds: string[]) => ({
  id, scope: 'private', externalQueryAllowed: false, questionIds, probeIds: [],
  c: name, g: 3, p: [0, 0, 0], n: 1, o: 1, f: 0, hue: 218, sat: 0, pe: 0, bu: 0, fi: '', la: '', ev: [],
})
const universe = {
  schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
  meta: { items: 4, concepts: 2, clusters: 1, own: 1, fav: 3, span: [1, 2], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [{ g: 3, name: 'AI编程', lead: 'Alpha', c: [0, 0, 0], n: 2, o: 2, f: 0, hue: 218, sat: 0, mem: ['Alpha'] }],
  stars: [
    star('star:v1:private:8ed3f6ad685b959e', 'Alpha', ['question:7', 'question:8']),
    star('star:v1:private:f44e64e75f3948e9', 'Beta', ['question:9']),
  ],
  particles: [], wormholes: [], solo: [], dark: [], nebula: [],
  questions: [
    { id: 'question:7', questionId: '7', title: 'Seven', url: 'https://www.zhihu.com/question/7', answerIds: ['answer:1', 'answer:2'] },
    { id: 'question:8', questionId: '8', title: 'Eight', url: 'https://www.zhihu.com/question/8', answerIds: ['answer:3'] },
    { id: 'question:9', questionId: '9', title: 'Nine', url: 'https://www.zhihu.com/question/9', answerIds: ['answer:4'] },
  ],
  answers: [
    answer('answer:1', 'question:7', [{ relation: 'collected', at: at(2025, 12) }]),
    answer('answer:2', 'question:7', [{ relation: 'created', at: at(2026, 2) }]),
    answer('answer:3', 'question:8', [{ relation: 'collected', at: at(2026, 1) }]),
    answer('answer:4', 'question:9', [{ relation: 'collected', at: at(2026, 3) }]),
  ],
  probes: [],
} as unknown as CurrentUniverse

describe('next station', () => {
  test('is the first question you touched after your last trace on this one', () => {
    const index = indexUniverse(universe)
    // 七号最后一次痕迹是 2026.02（八号的 2026.01 在它之前，不算），下一站是九号（2026.03）。
    expect(nextStationAfter(index, 'question:7')).toEqual({
      questionId: 'question:9', starId: 'star:v1:private:f44e64e75f3948e9', title: 'Nine', at: at(2026, 3),
    })
    // 八号（2026.01）之后最早的是七号的 2026.02。
    expect(nextStationAfter(index, 'question:8')?.questionId).toBe('question:7')
    // 九号是终点。
    expect(nextStationAfter(index, 'question:9')).toBeNull()
  })

  test('has no next station without dated traces', () => {
    const index = indexUniverse({ ...universe, answers: universe.answers!.map((item) => ({ ...item, bindings: [] })) } as CurrentUniverse)
    expect(nextStationAfter(index, 'question:7')).toBeNull()
    expect(nextStationAfter(index, 'question:nope')).toBeNull()
  })
})
