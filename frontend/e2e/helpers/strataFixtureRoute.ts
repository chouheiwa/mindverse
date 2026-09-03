import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type { WireCurrentStar, WireGeneration } from '../../src/types'

export interface StrataUniverseFixture {
  fixtureVersion: 'strata-universe.v1' | 'strata-universe.dense-500.v1'
  generation: WireGeneration
}

export interface StrataFixtureOptions {
  denseStars?: boolean
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

export function createStrataUniverseFixture(options: StrataFixtureOptions = {}): StrataUniverseFixture {
  if (!options.denseStars) return strataUniverseFixture
  const source = strataUniverseFixture.generation.universe
  if (!source || source.schemaVersion !== 'universe.v1') throw new Error('dense fixture requires universe.v1')
  const goldenAngle = Math.PI * (3 - Math.sqrt(5))
  const stars: WireCurrentStar[] = Array.from({ length: 500 }, (_, index) => {
    const unitY = 1 - 2 * (index + 0.5) / 500
    const radial = Math.sqrt(Math.max(0, 1 - unitY * unitY))
    const theta = index * goldenAngle
    const radius = 32 + index % 17 * 0.75
    return {
      id: `star:v1:public:dense-${index.toString().padStart(3, '0')}`,
      scope: 'public',
      externalQueryAllowed: true,
      questionIds: [],
      probeIds: [],
      c: `Dense ${index.toString().padStart(3, '0')}`,
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
