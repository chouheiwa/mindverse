import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type { WireGeneration } from '../../src/types'

export interface StrataUniverseFixture {
  fixtureVersion: 'strata-universe.v1'
  generation: WireGeneration
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

export async function installStrataFixture(page: Page): Promise<StrataUniverseFixture> {
  await page.route('**/api/universe', (route) => route.fulfill({ json: strataUniverseFixture.generation }))
  return strataUniverseFixture
}
