import type { Page } from '@playwright/test'
import type { WireGeneration, WireQuestionPlanet } from '../../src/types'
import type { ThermalState } from '../../src/starmap/babylon/planetSurface'
import { strataUniverseFixture } from './strataFixtureRoute'

export const PLANET_FIXTURE_VERSION = 'planet-render-gate.v1' as const

export interface PlanetRenderCase {
  readonly thermal: ThermalState
  readonly questionId: string
  readonly title: string
  readonly orbitIndex: number
}

export const PLANET_RENDER_CASES: readonly PlanetRenderCase[] = Object.freeze([
  { thermal: 'magma', questionId: 'question:101', title: 'Magma Gate Planet', orbitIndex: 1 },
  { thermal: 'desert', questionId: 'question:102', title: 'Desert Gate Planet', orbitIndex: 2 },
  { thermal: 'rock', questionId: 'question:103', title: 'Rock Gate Planet', orbitIndex: 3 },
  { thermal: 'tundra', questionId: 'question:104', title: 'Tundra Gate Planet', orbitIndex: 4 },
  { thermal: 'ice', questionId: 'question:108', title: 'Ice Gate Planet', orbitIndex: 8 },
])

const CASE_BY_ORBIT = new Map(PLANET_RENDER_CASES.map((entry) => [entry.orbitIndex, entry]))

export function createPlanetRenderFixture(): { fixtureVersion: typeof PLANET_FIXTURE_VERSION; generation: WireGeneration } {
  const base = structuredClone(strataUniverseFixture.generation)
  const universe = base.universe
  if (!universe || universe.schemaVersion !== 'universe.v1' || !universe.stars?.[0]) {
    throw new Error('planet render fixture requires the versioned strata universe')
  }
  const questions: WireQuestionPlanet[] = []
  for (let orbitIndex = 1; orbitIndex <= 8; orbitIndex += 1) {
    const renderCase = CASE_BY_ORBIT.get(orbitIndex)
    questions.push(renderCase ? {
      id: renderCase.questionId,
      questionId: renderCase.questionId.slice('question:'.length),
      title: renderCase.title,
      url: `https://www.zhihu.com/question/${renderCase.questionId.slice('question:'.length)}`,
      answerIds: [],
    } : {
      id: `question:10${orbitIndex}`,
      questionId: `10${orbitIndex}`,
      title: `Planet Gate Spacer ${orbitIndex}`,
      url: `https://www.zhihu.com/question/10${orbitIndex}`,
      answerIds: [],
    })
  }
  universe.stars[0].questionIds = questions.map(({ id }) => id)
  universe.questions = questions
  universe.answers = []
  universe.probes = []
  universe.meta = { ...universe.meta, items: questions.length, source: 'e2e-planet-render-gate-v1' }
  return {
    fixtureVersion: PLANET_FIXTURE_VERSION,
    generation: { ...base, source: 'e2e-planet-render-gate-v1', universe } as WireGeneration,
  }
}

export async function installPlanetRenderFixture(page: Page) {
  const fixture = createPlanetRenderFixture()
  await page.route('**/api/universe', (route) => route.fulfill({ json: fixture.generation }))
  return fixture
}
