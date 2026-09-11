import { describe, expect, test } from 'vitest'
import { describeQuestionProvenance } from './questionProvenance'
import { indexUniverse } from './universe'
import type { CurrentUniverse } from '../types'

// 落到地表以后眼前只有地形，看不出这颗星球为什么在这里、和我有什么关系。
// 资料卡先回答「你为什么在这」：最早那次创作/收藏、作者、所属星群、系内排名。
const at = (year: number, month: number) => Math.floor(Date.UTC(year, month - 1, 15) / 1000)
const answer = (id: string, over: Record<string, unknown>) => ({
  id, questionId: 'question:7', title: 'Q', summary: '', url: `https://www.zhihu.com/question/7/answer/${id.split(':')[1]}`,
  authorId: 'author:x', authorName: '', publishedAt: at(2024, 1), updatedAt: at(2024, 1), observedAt: at(2024, 1),
  likeCount: 0, commentCount: 0, favoriteCount: 0, bindings: [], discoverySources: ['public_search'], ...over,
})
const universe = {
  schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
  meta: { items: 3, concepts: 2, clusters: 1, own: 1, fav: 2, span: [1, 2], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [{ g: 3, name: 'AI编程', lead: 'Alpha', c: [0, 0, 0], n: 2, o: 2, f: 0, hue: 218, sat: 0, mem: ['Alpha'] }],
  stars: [{ id: 'star:v1:private:8ed3f6ad685b959e', scope: 'private', externalQueryAllowed: false, questionIds: ['question:7', 'question:8', 'question:9'], probeIds: [],
    c: 'Alpha', g: 3, p: [0, 0, 0], n: 3, o: 1, f: 0, hue: 218, sat: 0, pe: 0, bu: 0, fi: '', la: '', ev: [] }],
  particles: [], wormholes: [], solo: [], dark: [], nebula: [],
  questions: [
    { id: 'question:7', questionId: '7', title: 'Seven', url: 'https://www.zhihu.com/question/7', answerIds: ['answer:1', 'answer:2', 'answer:3'] },
    { id: 'question:8', questionId: '8', title: 'Eight', url: 'https://www.zhihu.com/question/8', answerIds: [] },
    { id: 'question:9', questionId: '9', title: 'Nine', url: 'https://www.zhihu.com/question/9', answerIds: [] },
  ],
  answers: [
    answer('answer:1', { authorName: '张三', bindings: [{ relation: 'collected', at: at(2025, 12), folders: [] }] }),
    answer('answer:2', { authorName: '李四', bindings: [{ relation: 'created', at: at(2026, 3), folders: [] }] }),
    answer('answer:3', { bindings: [{ relation: 'collected', at: at(2026, 1), folders: [] }] }),
  ],
  probes: [],
} as unknown as CurrentUniverse

describe('question provenance', () => {
  test('tells you why you are here: the earliest trace, the author, the cluster, the rank', () => {
    const index = indexUniverse(universe)
    const provenance = describeQuestionProvenance(index, 'question:7', { starId: 'star:v1:private:8ed3f6ad685b959e', orbitIndex: 2, orbitCount: 3 })
    expect(provenance.origin).toBe('你在 2025.12 收藏了张三的回答')
    expect(provenance.starName).toBe('Alpha')
    expect(provenance.clusterName).toBe('AI编程')
    expect(provenance.rank).toEqual({ index: 2, count: 3 })
    expect(provenance.createdCount).toBe(1)
    expect(provenance.collectedCount).toBe(2)
    expect(provenance.firstAt).toBe(at(2025, 12))
    expect(provenance.latestAt).toBe(at(2026, 3))
  })

  test('falls back honestly when there is no personal trace', () => {
    const index = indexUniverse({ ...universe, answers: universe.answers!.map((item) => ({ ...item, bindings: [] })) } as CurrentUniverse)
    const provenance = describeQuestionProvenance(index, 'question:7', { starId: 'star:v1:private:8ed3f6ad685b959e', orbitIndex: 1, orbitCount: 3 })
    expect(provenance.origin).toBe('通过公开搜索发现，没有你的创作或收藏')
    expect(provenance.createdCount).toBe(0)
    expect(provenance.firstAt).toBeUndefined()
  })

  test('survives an unknown question or star', () => {
    const index = indexUniverse(universe)
    const provenance = describeQuestionProvenance(index, 'question:nope', { starId: 'star:nope', orbitIndex: 1, orbitCount: 1 })
    expect(provenance.origin).toBeNull()
    expect(provenance.starName).toBeNull()
    expect(provenance.clusterName).toBeNull()
  })
})
