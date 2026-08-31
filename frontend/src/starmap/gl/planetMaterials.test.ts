import { describe, expect, test } from 'vitest'
import type { QuestionPlanetDatum } from '../../domain/universe'
import type { UniverseIndex } from '../../domain/universe'
import type { AnswerSatellite } from '../../types'
import type { CurrentStar, Universe } from '../../types'
import * as THREE from 'three'
import { makeBodies, type PlanetDatum } from './bodies'
import {
  buildMaterialTimeline,
  groupPlanetInstances,
  nextPlanetLod,
  planetInstanceIndexMap,
  planetMaterialInput,
  type PlanetFamily,
  type PlanetMaterialInput,
} from './planetMaterials'

type MaterialIsRequired = object extends Pick<PlanetDatum, 'material'> ? false : true
const materialIsRequired: MaterialIsRequired = true

const material = (family: PlanetFamily, overrides: Partial<PlanetMaterialInput> = {}): PlanetMaterialInput => ({
  seed: 0.25,
  family,
  answerDensity: 0.5,
  timeSpan: null,
  freshness: 0.5,
  divergence: null,
  created: false,
  collected: false,
  ...overrides,
})

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
      .find((geometry) => geometry.getAttribute('iSurface'))!
    const surface = Array.from(planetGeometry.getAttribute('iSurface').array)
    const chronicle = Array.from(planetGeometry.getAttribute('iChronicle').array)
    const material = layer.planets[0].material

    const withoutOrphan = planetMaterialInput(datum(answers), buildMaterialTimeline(answers))
    expect(material).toEqual(planetMaterialInput(datum(answers), buildMaterialTimeline([...answers, orphanAnswer])))
    expect(material.freshness).toBeCloseTo(250 / 450)
    expect(material.timeSpan).toBe(withoutOrphan.timeSpan)
    expect(material).toMatchObject({ created: true, collected: false })
    expect(surface).toEqual([
      Math.fround(material.seed),
      Math.fround(material.answerDensity),
      Math.fround(material.freshness),
      expect.any(Number),
    ])
    expect(chronicle).toEqual([Math.fround(material.timeSpan!), 1, 1, 0])
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

describe('planet surface batching and LOD', () => {
  test('groups every global instance exactly once into at most four stable family batches', () => {
    const inputs = [
      material('cloud'), material('basalt'), material('archive'),
      material('cloud'), material('strata'), material('basalt'),
    ]
    const groups = groupPlanetInstances(inputs)

    expect(groups).toHaveLength(4)
    expect(groups.map((group) => group.family)).toEqual(['basalt', 'strata', 'cloud', 'archive'])
    const globals = groups.flatMap((group) => group.globalIndices)
    expect(globals).toHaveLength(inputs.length)
    expect(new Set(globals).size).toBe(inputs.length)
    expect([...globals].sort((a, b) => a - b)).toEqual(inputs.map((_, index) => index))
  })

  test('maps the first and last member of every family in both directions', () => {
    const inputs = [
      material('basalt'), material('strata'), material('cloud'), material('archive'),
      material('archive'), material('cloud'), material('strata'), material('basalt'),
    ]
    const groups = groupPlanetInstances(inputs)
    const indexMap = planetInstanceIndexMap(groups, inputs.length)

    for (const group of groups) {
      const firstGlobal = group.globalIndices[0]
      const lastLocal = group.globalIndices.length - 1
      const lastGlobal = group.globalIndices[lastLocal]
      expect(indexMap.toLocal(firstGlobal)).toEqual({ family: group.family, instanceIndex: 0 })
      expect(indexMap.toGlobal(group.family, 0)).toBe(firstGlobal)
      expect(indexMap.toLocal(lastGlobal)).toEqual({ family: group.family, instanceIndex: lastLocal })
      expect(indexMap.toGlobal(group.family, lastLocal)).toBe(lastGlobal)
    }
    expect(indexMap.toLocal(-1)).toBeNull()
    expect(indexMap.toLocal(inputs.length)).toBeNull()
    expect(indexMap.toGlobal('cloud', 99)).toBeNull()
  })

  test('rejects a global instance duplicated across family batches', () => {
    expect(() => planetInstanceIndexMap([
      { family: 'basalt', globalIndices: [0] },
      { family: 'cloud', globalIndices: [0] },
    ], 1)).toThrow('duplicate global planet index: 0')
  })

  test('uses exact projected-radius hysteresis boundaries in both directions', () => {
    expect(nextPlanetLod('far', 17.999)).toBe('far')
    expect(nextPlanetLod('far', 18)).toBe('medium')
    expect(nextPlanetLod('far', 19)).toBe('medium')
    expect(nextPlanetLod('medium', 16)).toBe('medium')
    expect(nextPlanetLod('medium', 11)).toBe('far')
    expect(nextPlanetLod('medium', 12)).toBe('medium')
    expect(nextPlanetLod('medium', 83.999)).toBe('medium')
    expect(nextPlanetLod('medium', 84)).toBe('near')
    expect(nextPlanetLod('near', 73)).toBe('near')
    expect(nextPlanetLod('near', 72)).toBe('medium')
  })

  test('keeps unknown divergence inert while ownership channels remain independent', () => {
    const inputs = [
      material('basalt', { divergence: null, created: false, collected: true }),
      material('strata', { divergence: null, created: true, collected: false }),
    ]

    expect(inputs.every((input) => input.divergence === null)).toBe(true)
    expect(inputs[0]).toMatchObject({ created: false, collected: true })
    expect(inputs[1]).toMatchObject({ created: true, collected: false })
  })

  test('renders four indexed batches with exact attributes and migrates selection with its orbit', () => {
    const families: readonly PlanetFamily[] = ['basalt', 'strata', 'cloud', 'archive']
    const used = new Set<string>()
    const questionIdFor = (family: PlanetFamily) => {
      for (let candidate = 0; candidate < 10_000; candidate++) {
        const id = `question:family:${candidate}`
        if (used.has(id)) continue
        const candidateDatum = datum([], {
          question: { id, questionId: String(candidate), title: family, url: '', answerIds: [] },
        })
        if (planetMaterialInput(candidateDatum, buildMaterialTimeline([])).family === family) {
          used.add(id)
          return id
        }
      }
      throw new Error(`unable to find fixture id for ${family}`)
    }
    const questions = families.map((family) => {
      const id = questionIdFor(family)
      return { id, questionId: id, title: family, url: '', answerIds: [] }
    })
    const star: CurrentStar = {
      id: 'star:families', c: 'families', g: 1, p: [0, 0, 0], n: 4, o: 0, f: 0,
      hue: 210, sat: .5, pe: 0, bu: 0, fi: '', la: '', ev: [], scope: 'public',
      externalQueryAllowed: false, questionIds: questions.map(({ id }) => id), probeIds: [],
    }
    const universe = {
      schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
      meta: { items: 4, concepts: 1, clusters: 1, own: 0, fav: 0, span: [0, 0] as [number, number], medz: 0, p10z: 0, source: 'test', splits: 0 },
      clusters: [{ g: 1, name: 'families', lead: 'families', c: [0, 0, 0] as [number, number, number], n: 4, o: 0, f: 0, hue: 210, sat: .5, mem: ['families'] }],
      stars: [star], particles: [], wormholes: [], solo: [], dark: [], nebula: [],
      questions, answers: [], probes: [],
    } satisfies Universe
    const index: UniverseIndex = {
      universe,
      starsById: new Map([[star.id, star]]),
      questionsById: new Map(questions.map((question) => [question.id, question])),
      answersById: new Map(), probesById: new Map(),
    }
    const layer = makeBodies(index, true)
    const batches = layer.group.children.filter((child): child is THREE.InstancedMesh =>
      child instanceof THREE.InstancedMesh && Boolean(child.geometry.getAttribute('iSurface')))
    const ring = layer.group.children.find((child) =>
      child instanceof THREE.LineSegments && Boolean(child.geometry.getAttribute('iSel'))) as THREE.LineSegments

    expect(batches).toHaveLength(4)
    expect(new Set(batches.map((batch) => batch.geometry.getAttribute('position'))).size).toBe(1)
    expect(new Set(batches.map((batch) => batch.material)).size).toBe(4)
    expect(batches.reduce((sum, batch) => sum + batch.count, 0)).toBe(4)
    const shaders = batches.map((batch) => batch.material as THREE.ShaderMaterial)
    expect(shaders.map((shader) => shader.uniforms.uMotion.value)).toEqual([0, 0, 0, 0])
    expect(shaders.map((shader) => shader.fragmentShader.match(/#define PLANET_FAMILY (\d)/)?.[1])).toEqual(['0', '1', '2', '3'])
    for (const shader of shaders) {
      expect(shader.vertexShader).toContain('iSurface')
      expect(shader.vertexShader).toContain('iChronicle')
      expect(shader.fragmentShader).toContain('smoothstep(12.0, 18.0, vPlanetPx)')
      expect(shader.fragmentShader).toContain('smoothstep(72.0, 84.0, vPlanetPx)')
      expect(shader.fragmentShader).toContain('if (vLod >= 1.5)')
      expect(shader.fragmentShader).toContain('if (vCreated > 0.5)')
      expect(shader.fragmentShader).toContain('mix(0.82, fract(uT * 0.00012), uMotion)')
      expect(shader.fragmentShader).not.toContain('divergence')
      expect(shader.fragmentShader).not.toContain('iChronicle')
    }
    for (let globalIndex = 0; globalIndex < layer.planets.length; globalIndex++) {
      const local = layer.planetIndexMap.toLocal(globalIndex)!
      const batch = batches.find((candidate) => candidate.userData.planetFamily === local.family)!
      const surface = batch.geometry.getAttribute('iSurface') as THREE.InstancedBufferAttribute
      const chronicle = batch.geometry.getAttribute('iChronicle') as THREE.InstancedBufferAttribute
      const input = layer.planets[globalIndex].material
      expect(Array.from(surface.array).slice(local.instanceIndex * 4, local.instanceIndex * 4 + 4)).toEqual([
        Math.fround(input.seed), Math.fround(input.answerDensity), Math.fround(input.freshness), families.indexOf(input.family),
      ])
      expect(Array.from(chronicle.array).slice(local.instanceIndex * 4, local.instanceIndex * 4 + 4)).toEqual([0, 0, 0, 0])
    }

    const first = layer.planetIndexMap.toGlobal('basalt', 0)!
    const second = layer.planetIndexMap.toGlobal('cloud', 0)!
    layer.setSelected(first)
    expect(selectedGlobals(batches, layer)).toEqual([first])
    expect(Array.from((ring.geometry.getAttribute('iSel') as THREE.BufferAttribute).array)).toEqual([1, 0, 0, 0])
    layer.setSelected(second)
    expect(selectedGlobals(batches, layer)).toEqual([second])
    expect(Array.from((ring.geometry.getAttribute('iSel') as THREE.BufferAttribute).array)).toEqual([0, 0, 1, 0])
    layer.setSelected(-1)
    expect(selectedGlobals(batches, layer)).toEqual([])
    expect(Array.from((ring.geometry.getAttribute('iSel') as THREE.BufferAttribute).array)).toEqual([0, 0, 0, 0])
    expect(layer.planetsForStar(layer.data[0])).toEqual(layer.planets)

    const lodPlanet = layer.planets[first]
    const lodLocal = layer.planetIndexMap.toLocal(first)!
    const lodBatch = batches.find((candidate) => candidate.userData.planetFamily === lodLocal.family)!
    const lodState = lodBatch.geometry.getAttribute('iAxisLod') as THREE.InstancedBufferAttribute
    const planetWorld = new THREE.Vector3(
      (lodPlanet.u[0] * Math.cos(lodPlanet.phase) + lodPlanet.v[0] * Math.sin(lodPlanet.phase)) * lodPlanet.orbitR,
      (lodPlanet.u[1] * Math.cos(lodPlanet.phase) + lodPlanet.v[1] * Math.sin(lodPlanet.phase)) * lodPlanet.orbitR,
      (lodPlanet.u[2] * Math.cos(lodPlanet.phase) + lodPlanet.v[2] * Math.sin(lodPlanet.phase)) * lodPlanet.orbitR,
    )
    const camera = new THREE.PerspectiveCamera(55, 1, .5, 100)
    camera.position.copy(planetWorld).add(new THREE.Vector3(0, 0, 10))
    camera.lookAt(planetWorld)
    layer.setFocus(star.c)
    const setProjectedRadius = (radius: number) => {
      layer.updatePlanetLods(camera, 0, radius * 10 / lodPlanet.radius)
      return lodState.getW(lodLocal.instanceIndex)
    }
    expect(setProjectedRadius(19)).toBe(1)
    const stableMediumVersion = lodState.version
    expect(setProjectedRadius(16)).toBe(1)
    expect(lodState.version).toBe(stableMediumVersion)
    expect(setProjectedRadius(11)).toBe(0)
    expect(setProjectedRadius(19)).toBe(1)
    expect(setProjectedRadius(84)).toBe(2)
    expect(setProjectedRadius(73)).toBe(2)
    expect(setProjectedRadius(71)).toBe(1)
    layer.dispose()

    const movingLayer = makeBodies(index, false)
    const movingMaterials = movingLayer.group.children
      .filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh && Boolean(child.geometry.getAttribute('iSurface')))
      .map((batch) => batch.material as THREE.ShaderMaterial)
    expect(movingMaterials.map((shader) => shader.uniforms.uMotion.value)).toEqual([1, 1, 1, 1])
    movingLayer.dispose()
  })
})

function selectedGlobals(batches: readonly THREE.InstancedMesh[], layer: ReturnType<typeof makeBodies>): number[] {
  const result: number[] = []
  for (const batch of batches) {
    const family = batch.userData.planetFamily as PlanetFamily
    const selected = batch.geometry.getAttribute('iColorSelected') as THREE.InstancedBufferAttribute
    for (let localIndex = 0; localIndex < selected.count; localIndex++) {
      if (selected.getW(localIndex) > .5) result.push(layer.planetIndexMap.toGlobal(family, localIndex)!)
    }
  }
  return result
}
