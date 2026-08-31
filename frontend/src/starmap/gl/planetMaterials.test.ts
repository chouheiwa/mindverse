import { describe, expect, test } from 'vitest'
import type { QuestionPlanetDatum } from '../../domain/universe'
import type { UniverseIndex } from '../../domain/universe'
import type { AnswerSatellite } from '../../types'
import type { CurrentStar, Universe } from '../../types'
import * as THREE from 'three'
import { makeBodies, type PlanetDatum } from './bodies'
import { buildMaterialTimeline, planetMaterialInput } from './planetMaterials'

type MaterialIsRequired = object extends Pick<PlanetDatum, 'material'> ? false : true
const materialIsRequired: MaterialIsRequired = true

function answer(id: string, overrides: Partial<AnswerSatellite> = {}): AnswerSatellite {
  return {
    id,
    questionId: 'question:7',
    title: id,
    url: `https://www.zhihu.com/answer/${id}`,
    bindings: [],
    discoverySources: [],
    ...overrides,
  }
}

function datum(answers: readonly AnswerSatellite[], overrides: Partial<QuestionPlanetDatum> = {}): QuestionPlanetDatum {
  const answerIds = answers.map(({ id }) => id)
  return {
    starId: 'star:1',
    orbitIndex: 1,
    question: { id: 'question:7', questionId: '7', title: 'Question', url: '', answerIds },
    aggregate: {
      answers,
      answerCount: answerIds.length,
      created: false,
      collected: false,
    },
    answers,
    answerCount: answerIds.length,
    created: false,
    collected: false,
    ...overrides,
  }
}

describe('planet material inputs', () => {
  test('requires renderer planet data to carry its normalized material input', () => {
    expect(materialIsRequired).toBe(true)
  })

  test('is stable and derives seed and family only from the question id', () => {
    const answers = [answer('answer:1', { publishedAt: 100 })]
    const timeline = buildMaterialTimeline(answers)
    const first = planetMaterialInput(datum(answers), timeline)
    const sameQuestionInAnotherSession = datum([], {
      starId: 'star:99',
      orbitIndex: 12,
      question: { id: 'question:7', questionId: 'changed', title: 'Changed', url: '/changed', answerIds: [] },
    })

    expect(planetMaterialInput(datum(answers), timeline)).toEqual(first)
    expect(planetMaterialInput(sameQuestionInAnotherSession, buildMaterialTimeline([])).seed).toBe(first.seed)
    expect(planetMaterialInput(sameQuestionInAnotherSession, buildMaterialTimeline([])).family).toBe(first.family)
    expect(first.family).toMatch(/^(basalt|strata|cloud|archive)$/)
    expect(first.seed).toBeGreaterThanOrEqual(0)
    expect(first.seed).toBeLessThan(1)
  })

  test('makeBodies carries the normalized input in PlanetDatum and instance attributes', () => {
    const answers = [
      answer('answer:1', { publishedAt: 100, bindings: [{ relation: 'created', folders: [] }] }),
      answer('answer:2', { publishedAt: 200, updatedAt: 300 }),
    ]
    const question = { id: 'question:7', questionId: '7', title: 'Question', url: '', answerIds: answers.map(({ id }) => id) }
    const orphanAnswer = answer('answer:orphan', {
      questionId: 'question:orphan', publishedAt: 50, updatedAt: 500,
      bindings: [{ relation: 'collected', folders: ['Orphan'] }],
    })
    const orphanQuestion = {
      id: 'question:orphan', questionId: 'orphan', title: 'Not selected by a star', url: '',
      answerIds: [orphanAnswer.id],
    }
    const star: CurrentStar = {
      id: 'star:1', c: 'concept', g: 1, p: [0, 0, 0], n: 2, o: 1, f: 0,
      hue: 210, sat: .5, pe: 0, bu: 0, fi: '', la: '', ev: [], scope: 'public',
      externalQueryAllowed: false, questionIds: [question.id], probeIds: [],
    }
    const universe = {
      schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
      meta: { items: 2, concepts: 1, clusters: 1, own: 1, fav: 0, span: [0, 0] as [number, number], medz: 0, p10z: 0, source: 'test', splits: 0 },
      clusters: [{ g: 1, name: 'one', lead: 'concept', c: [0, 0, 0] as [number, number, number], n: 2, o: 1, f: 0, hue: 210, sat: .5, mem: ['concept'] }],
      stars: [star], particles: [], wormholes: [], solo: [], dark: [], nebula: [],
      questions: [question, orphanQuestion], answers: [...answers, orphanAnswer], probes: [],
    } satisfies Universe
    const index: UniverseIndex = {
      universe,
      starsById: new Map([[star.id, star]]),
      questionsById: new Map([[question.id, question], [orphanQuestion.id, orphanQuestion]]),
      answersById: new Map([...answers, orphanAnswer].map((item) => [item.id, item])),
      probesById: new Map(),
    }

    const layer = makeBodies(index, true)
    const planetGeometry = layer.group.children
      .map((child) => (child as THREE.Mesh).geometry as THREE.BufferGeometry)
      .find((geometry) => geometry.getAttribute('iMaterial0'))!
    const material0 = Array.from(planetGeometry.getAttribute('iMaterial0').array)
    const material1 = Array.from(planetGeometry.getAttribute('iMaterial1').array)
    const material = layer.planets[0].material

    const withoutOrphan = planetMaterialInput(datum(answers), buildMaterialTimeline(answers))
    expect(material).toEqual(planetMaterialInput(datum(answers), buildMaterialTimeline([...answers, orphanAnswer])))
    expect(material.freshness).toBeCloseTo(250 / 450)
    expect(material.timeSpan).toBe(withoutOrphan.timeSpan)
    expect(material).toMatchObject({ created: true, collected: false })
    expect(material0).toEqual([
      Math.fround(material.seed),
      expect.any(Number),
      Math.fround(material.answerDensity),
      Math.fround(material.timeSpan!),
    ])
    expect(material1).toEqual([Math.fround(250 / 450), -1, 1, 0])
    layer.dispose()
  })

  test('uses the validated question references for logarithmic answer density', () => {
    const answers = [answer('answer:1')]
    const mismatched = datum(answers, {
      answerCount: 999,
      question: {
        id: 'question:7', questionId: '7', title: 'Question', url: '',
        answerIds: ['answer:1', 'answer:2', 'answer:3'],
      },
    })

    expect(planetMaterialInput(mismatched, buildMaterialTimeline([])).answerDensity)
      .toBeCloseTo(Math.log1p(3) / Math.log1p(30))
  })

  test('clamps very large answer collections to a finite density', () => {
    const manyIds = Array.from({ length: 100_000 }, (_, index) => `answer:${index}`)
    const input = planetMaterialInput(datum([], {
      question: { id: 'question:large', questionId: 'large', title: 'Large', url: '', answerIds: manyIds },
    }), buildMaterialTimeline([]))

    expect(input.answerDensity).toBe(1)
    expect(Number.isFinite(input.answerDensity)).toBe(true)
  })

  test('normalizes public freshness globally and defaults missing own public time to .35', () => {
    const early = answer('answer:early', { publishedAt: 100 })
    const middle = answer('answer:middle', { publishedAt: 200 })
    const late = answer('answer:late', { updatedAt: 300 })
    const timeline = buildMaterialTimeline([early, middle, late])

    expect(planetMaterialInput(datum([middle]), timeline).freshness).toBeCloseTo(.5)
    expect(planetMaterialInput(datum([], { latestPublicAt: undefined }), timeline).freshness).toBe(.35)
  })

  test('ignores invalid times and needs two valid publication times for a span', () => {
    const invalid = answer('answer:invalid', { publishedAt: Number.NaN, updatedAt: -10 })
    const zero = answer('answer:zero', { publishedAt: 0, updatedAt: Number.POSITIVE_INFINITY })
    const valid = answer('answer:valid', { publishedAt: 200 })
    const timeline = buildMaterialTimeline([invalid, zero, valid, answer('answer:max', { publishedAt: 400 })])

    expect(planetMaterialInput(datum([invalid, zero]), timeline)).toMatchObject({ freshness: .35, timeSpan: null })
    expect(planetMaterialInput(datum([invalid, valid]), timeline).timeSpan).toBeNull()
  })

  test('represents two equal valid publication times as a zero span', () => {
    const answers = [
      answer('answer:first', { publishedAt: 200 }),
      answer('answer:second', { publishedAt: 200 }),
    ]

    expect(planetMaterialInput(datum(answers), buildMaterialTimeline(answers)).timeSpan).toBe(0)
  })

  test('clamps an extreme finite publication span before it reaches a float attribute', () => {
    const answers = [
      answer('answer:first', { publishedAt: 1 }),
      answer('answer:last', { publishedAt: Number.MAX_VALUE }),
    ]

    expect(planetMaterialInput(datum(answers), buildMaterialTimeline(answers)).timeSpan)
      .toBe(Number.MAX_SAFE_INTEGER)
  })

  test('updated time raises freshness but never contributes to the question publication span', () => {
    const first = answer('answer:first', { publishedAt: 100 })
    const second = answer('answer:second', { publishedAt: 200 })
    const updated = { ...second, updatedAt: 900 }
    const timeline = buildMaterialTimeline([first, second, updated, answer('answer:max', { publishedAt: 1_000 })])
    const before = planetMaterialInput(datum([first, second]), timeline)
    const after = planetMaterialInput(datum([first, updated]), timeline)

    expect(after.freshness).toBeGreaterThan(before.freshness)
    expect(after.timeSpan).toBe(before.timeSpan)
    expect(after.timeSpan).toBe(100)
  })

  test('reads ownership only from admitted answer bindings and never invents divergence', () => {
    const neutral = planetMaterialInput(datum([answer('answer:neutral')], {
      created: true,
      collected: true,
    }), buildMaterialTimeline([]))
    const relatedAnswers = [
      answer('answer:created', { bindings: [{ relation: 'created', folders: [] }] }),
      answer('answer:collected', { bindings: [{ relation: 'collected', folders: ['Reading'] }] }),
    ]
    const related = planetMaterialInput(datum(relatedAnswers), buildMaterialTimeline([]))

    expect(neutral).toMatchObject({ created: false, collected: false, divergence: null })
    expect(related).toMatchObject({ created: true, collected: true, divergence: null })
  })
})
