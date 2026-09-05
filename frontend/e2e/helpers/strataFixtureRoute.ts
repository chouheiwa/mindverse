import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { Page } from '@playwright/test'
import type { WireCurrentStar, WireGeneration } from '../../src/types'

export interface StrataUniverseFixture {
  fixtureVersion: 'strata-universe.v1' | 'strata-universe.dense-500.v1' | 'strata-universe.modes.v1'
    | 'strata-universe.probes.v1'
  generation: WireGeneration
}

export interface StrataFixtureOptions {
  denseStars?: boolean
  /** Populates the layers the mode bar switches between: wormholes, dying stars, nebula bursts, orphans and dust. */
  modeLayers?: boolean
  /** Binds article probes to the strata star so the inspection journey has a craft to fly to. */
  probes?: boolean
}

export const strataUniverseFixture = JSON.parse(
  readFileSync(new URL('../fixtures/strata-universe.json', import.meta.url), 'utf8'),
) as StrataUniverseFixture

export function assertStrataWireFixture(fixture: StrataUniverseFixture): void {
  const universe = fixture.generation.universe
  const question = universe?.questions?.find(({ id }) => id === 'question:7')
  if (!universe || !question) throw new Error('strata fixture must contain question:7')
  const answers = (question.answerIds ?? []).flatMap((id) => universe.answers?.find((answer) => answer.id === id) ?? [])
  const dated = answers.filter(({ publishedAt }) => Number.isFinite(publishedAt) && (publishedAt ?? 0) > 0)
  const authors = new Set(dated.flatMap(({ authorId }) => authorId ? [authorId] : []))
  if (dated.length !== 12 || authors.size < 6) throw new Error('strata fixture requires 12 dated answers and six authors')
  if (!answers.some(({ publishedAt }) => publishedAt === undefined)) throw new Error('strata fixture requires one undated answer')
  const surfaceQuestion = universe.questions?.find(({ id }) => id === 'question:8')
  if (!surfaceQuestion || (surfaceQuestion.answerIds ?? []).length >= 12) throw new Error('strata fixture requires a below-gate question')
}

assertStrataWireFixture(strataUniverseFixture)

/**
 * A universe where every mode-bar button has something to show.
 *
 * The base strata fixture carries a single star and empty wormhole / dark /
 * nebula / solo lists, so it cannot tell a working mode bar from a broken one.
 */
/** 与后端一致的概念稳定摘要，星体 id 必须与 scope + concept 对得上。 */
function stableConceptDigest(concept: string): string {
  const normalized = concept.split(/\p{White_Space}+/u).filter(Boolean).join(' ').toLowerCase()
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

export function createModeLayerFixture(): StrataUniverseFixture {
  const source = strataUniverseFixture.generation.universe
  if (!source || source.schemaVersion !== 'universe.v1') throw new Error('mode fixture requires universe.v1')
  const base = source.stars?.[0]
  if (!base) throw new Error('mode fixture requires the strata star')
  const extra: WireCurrentStar[] = ['Beta', 'Gamma', 'Delta'].map((concept, index) => ({
    ...base,
    id: `star:v1:public:${stableConceptDigest(concept)}`,
    questionIds: [],
    c: concept,
    g: index === 0 ? 0 : 1,
    p: [14 + index * 9, index * 5 - 4, -6 - index * 7],
    n: 12 - index * 3,
    o: index === 0 ? 2 : 0,
    f: index === 1 ? 3 : 0,
    hue: index === 1 ? 32 : 218,
    sat: 60 + index * 4,
    pe: 0.9 - index * 0.25,
    bu: index / 8,
  }))
  const stars = [...(source.stars ?? []), ...extra] as WireCurrentStar[]
  return {
    fixtureVersion: 'strata-universe.modes.v1',
    generation: {
      ...strataUniverseFixture.generation,
      source: 'e2e-mode-layers-v1',
      universe: {
        ...source,
        meta: { ...source.meta, items: 24, concepts: 4, clusters: 2, source: 'e2e-mode-layers-v1' },
        clusters: [
          { g: 0, name: '地层测试星群', lead: 'Alpha', c: [0, 0, 0], n: 15, o: 1, f: 1, hue: 218, sat: 70, mem: ['Alpha', 'Beta'] },
          { g: 1, name: '边缘星群', lead: 'Gamma', c: [26, 1, -18], n: 9, o: 0, f: 2, hue: 32, sat: 62, mem: ['Gamma', 'Delta'] },
        ],
        stars,
        particles: Array.from({ length: 96 }, (_unused, index) => [
          Math.cos(index) * (6 + index % 9), (index % 13) - 6, Math.sin(index) * (6 + index % 11),
          index % 2, index % 4 === 0 ? 1 : 0,
        ]),
        wormholes: [{
          a: 0, b: 1, an: '地层测试星群', bn: '边缘星群', obs: 6, exp: 1.4, z: 2.4, ev: [],
        }],
        solo: [
          { c: '孤立概念一', n: 2, t: '孤立概念一', u: '', g: null, p: [-22, 6, 12] },
          { c: '孤立概念二', n: 1, t: '孤立概念二', u: '', g: null, p: [18, -9, 20] },
        ],
        dark: [{
          c: 'Gamma', n: 9, f: 3, o: 0, gap: 540, first: '2020.02', last: '2022.08', ev: [],
        }],
        nebula: [{ c: 'Beta', n: 12, burst: 1.8, first: '2021.04', last: '2021.07' }],
      },
    },
  }
}

/**
 * The strata star, now carrying two orbiting article probes.
 *
 * The base fixture has `probes: []`, so it cannot tell a restored probe layer
 * from a missing one — the inspection journey needs a craft in orbit.
 */
export function createProbeFixture(): StrataUniverseFixture {
  const source = strataUniverseFixture.generation.universe
  if (!source || source.schemaVersion !== 'universe.v1') throw new Error('probe fixture requires universe.v1')
  const base = source.stars?.[0]
  if (!base) throw new Error('probe fixture requires the strata star')
  const probes = [
    {
      id: 'article:701', title: '地层探测器一号', summary: '固定测试近景探测器',
      url: 'https://zhuanlan.zhihu.com/p/701',
      bindings: [{ relation: 'created' as const, at: 2, folders: [] }],
      discoverySources: ['own_content' as const],
    },
    {
      id: 'article:702', title: '地层探测器二号', summary: '第二艘，用来证明轨道槽位不重叠',
      url: 'https://zhuanlan.zhihu.com/p/702',
      bindings: [{ relation: 'created' as const, at: 3, folders: [] }],
      discoverySources: ['own_content' as const],
    },
  ]
  const stars = [{ ...base, probeIds: probes.map(({ id }) => id) }, ...(source.stars ?? []).slice(1)]
  return {
    fixtureVersion: 'strata-universe.probes.v1',
    generation: {
      ...strataUniverseFixture.generation,
      source: 'e2e-probes-v1',
      universe: {
        ...source,
        meta: { ...source.meta, source: 'e2e-probes-v1' },
        stars: stars as WireCurrentStar[],
        probes,
      },
    },
  }
}

export function createStrataUniverseFixture(options: StrataFixtureOptions = {}): StrataUniverseFixture {
  if (options.probes) return createProbeFixture()
  if (options.modeLayers) return createModeLayerFixture()
  if (!options.denseStars) return strataUniverseFixture
  const source = strataUniverseFixture.generation.universe
  if (!source || source.schemaVersion !== 'universe.v1') throw new Error('dense fixture requires universe.v1')
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const stars: WireCurrentStar[] = Array.from({ length: 500 }, (_, index) => {
    const unitY = 1 - 2 * (index + 0.5) / 500
    const radial = Math.sqrt(Math.max(0, 1 - unitY * unitY))
    const theta = index * goldenAngle
    const radius = 32 + index % 17 * 0.75
    const concept = `Dense ${index.toString().padStart(3, '0')}`
    const normalizedConcept = concept.split(/\p{White_Space}+/u).filter(Boolean).join(' ').toLowerCase()
    const stableDigest = createHash('sha256').update(normalizedConcept).digest('hex').slice(0, 16)
    return {
      id: `star:v1:public:${stableDigest}`,
      scope: 'public',
      externalQueryAllowed: true,
      questionIds: [],
      probeIds: [],
      c: concept,
      g: 0,
      p: [Math.cos(theta) * radial * radius, unitY * radius, Math.sin(theta) * radial * radius],
      n: 1 + index % 37,
      o: index % 5 === 0 ? 1 : 0,
      f: index % 7 === 0 ? 1 : 0,
      hue: (index * 47) % 360,
      sat: 48 + index % 43,
      pe: 0.2 + (index % 81) / 100,
      bu: (index % 11) / 10,
      fi: '2020.01',
      la: '2024.12',
      ev: [],
    }
  })
  return {
    fixtureVersion: 'strata-universe.dense-500.v1',
    generation: {
      ...strataUniverseFixture.generation,
      source: 'e2e-dense-stars-v1',
      universe: {
        ...source,
        meta: { ...source.meta, items: 500, concepts: 500, source: 'e2e-dense-stars-v1' },
        clusters: [{
          g: 0, name: '稠密性能星群', lead: 'Dense 000', c: [0, 0, 0], n: 500,
          o: 100, f: 72, hue: 218, sat: 70, mem: stars.map(({ c }) => c),
        }],
        stars,
        particles: [],
        wormholes: [],
        solo: [],
        dark: [],
        nebula: [],
        questions: [],
        answers: [],
        probes: [],
      },
    },
  }
}

export async function installStrataFixture(
  page: Page,
  options: StrataFixtureOptions = {},
): Promise<StrataUniverseFixture> {
  const fixture = createStrataUniverseFixture(options)
  await page.route('**/api/universe', (route) => route.fulfill({ json: fixture.generation }))
  return fixture
}
