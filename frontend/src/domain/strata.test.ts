import { describe, expect, test } from 'vitest'
import { buildStrataSceneModel, StrataQuestionNotFoundError } from './strata'
import { makeStrataFixture, strataFixture } from '../test/strataFixture'

const DAY = 86_400

describe('strata evidence gate', () => {
  test('uses surface-only without chronological placement below the hard gate', () => {
    const fixture = makeStrataFixture({ datedCount: 11, includeUndated: false })
    const model = buildStrataSceneModel(fixture.index, 'question:7')

    expect(model.evidenceLevel).toBe('surface-only')
    expect(model.surfaceSpecimens).toHaveLength(11)
    expect(model.strata).toEqual([])
    expect(model.undated).toEqual([])
  })

  test('uses the approved six-author vertical-slice fixture', () => {
    expect(strataFixture.authorIds).toHaveLength(6)
  })

  test('places every answer exactly once in retrospective mode', () => {
    const model = buildStrataSceneModel(strataFixture.index, 'question:7')
    const ids = [
      ...model.surfaceSpecimens,
      ...model.strata.flatMap((layer) => layer.specimens),
      ...model.undated,
    ].map((item) => item.answerId)

    expect(model.evidenceLevel).toBe('retrospective')
    expect(ids).toHaveLength(new Set(ids).size)
    expect(ids.sort()).toEqual(strataFixture.answerIds.slice().sort())
  })

  test('preserves created and collected as a stable relation set', () => {
    const model = buildStrataSceneModel(strataFixture.index, 'question:7')
    const specimen = model.strata.flatMap((layer) => layer.specimens)
      .find(({ answerId }) => answerId === 'answer:1')

    expect(specimen?.relations).toEqual(['created', 'collected'])
  })

  test('requires three stable authors globally', () => {
    const fixture = makeStrataFixture({ stableAuthors: 2 })

    expect(buildStrataSceneModel(fixture.index, 'question:7').evidenceLevel)
      .toBe('surface-only')
  })

  test('rejects a candidate split when either visible layer lacks three authors', () => {
    const fixture = makeStrataFixture({
      authorIds: [
        'author:1', 'author:1', 'author:1', 'author:1', 'author:1', 'author:1',
        'author:2', 'author:3', 'author:4', 'author:2', 'author:3', 'author:4',
      ],
    })

    expect(buildStrataSceneModel(fixture.index, 'question:7').evidenceLevel)
      .toBe('surface-only')
  })

  test('uses the legal density gap and orders layers from newest to oldest', () => {
    const model = buildStrataSceneModel(strataFixture.index, 'question:7')

    expect(model.strata).toHaveLength(2)
    expect(model.strata[0].specimens.map(({ answerId }) => answerId)).toEqual([
      'answer:7', 'answer:8', 'answer:9', 'answer:10', 'answer:11', 'answer:12',
    ])
    expect(model.strata[1].specimens.map(({ answerId }) => answerId)).toEqual([
      'answer:1', 'answer:2', 'answer:3', 'answer:4', 'answer:5', 'answer:6',
    ])
  })

  test('uses lexical boundary answer IDs to break equal-score DP ties', () => {
    const start = Date.UTC(2020, 6, 1) / 1000
    const fixture = makeStrataFixture({
      includeUndated: false,
      publishedAt: [
        start, start + DAY, start + 2 * DAY, start + 3 * DAY,
        start + 730 * DAY, start + 730 * DAY + DAY,
        start + 1458 * DAY, start + 1458 * DAY + DAY, start + 1458 * DAY + 2 * DAY,
        start + 1458 * DAY + 3 * DAY, start + 1458 * DAY + 4 * DAY,
        start + 1458 * DAY + 5 * DAY,
      ],
    })

    const model = buildStrataSceneModel(fixture.index, 'question:7')
    expect(model.strata).toHaveLength(2)
    expect(model.strata[1].specimens.map(({ answerId }) => answerId))
      .toEqual(['answer:1', 'answer:2', 'answer:3', 'answer:4'])
  })

  test('keeps unknown dates outside chronology and gives them no derived time', () => {
    const model = buildStrataSceneModel(strataFixture.index, 'question:7')

    expect(model.undated).toEqual([expect.objectContaining({
      answerId: 'answer:999',
      publishedAt: null,
    })])
    expect(model.strata.flatMap(({ specimens }) => specimens)
      .some(({ answerId }) => answerId === 'answer:999')).toBe(false)
  })

  test('applies the specified thickness formula and rounds geometry to six decimals', () => {
    const model = buildStrataSceneModel(strataFixture.index, 'question:7')

    expect(model.strata.map(({ thickness }) => thickness)).toEqual([18, 18])
    expect(model.strata.map(({ centerDepth }) => centerDepth)).toEqual([9, 27])
    expect(model.bounds).toEqual({ top: 0, bottom: 36 })
    for (const value of model.strata.flatMap(({ thickness, centerDepth }) => [thickness, centerDepth])) {
      expect(Number(value.toFixed(6))).toBe(value)
    }
  })

  test('is deeply immutable and byte-for-byte deterministic across calls', () => {
    const first = buildStrataSceneModel(strataFixture.index, 'question:7')
    const second = buildStrataSceneModel(strataFixture.index, 'question:7')

    expect(first).toEqual(second)
    expect(Object.isFrozen(first)).toBe(true)
    expect(Object.isFrozen(first.strata)).toBe(true)
    expect(Object.isFrozen(first.strata[0].specimens[0].relations)).toBe(true)
  })

  test('throws a typed error for an unknown question', () => {
    expect(() => buildStrataSceneModel(strataFixture.index, 'question:404'))
      .toThrow(StrataQuestionNotFoundError)
  })
})
