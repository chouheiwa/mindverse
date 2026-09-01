import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type { WireGeneration } from '../../src/types'

export interface E2EUniverseFixture {
  generation: WireGeneration
  stress: { questionCount: number, probeCount: number }
  assertions: {
    minNonBackgroundPixels: number
    questionCount: number
    probeCount: number
  }
}

const fixtureSeed = JSON.parse(
  readFileSync(new URL('../fixtures/universe.json', import.meta.url), 'utf8'),
) as E2EUniverseFixture

function expandStressFixture(seed: E2EUniverseFixture): E2EUniverseFixture {
  const universe = seed.generation.universe
  if (!universe || universe.schemaVersion !== 'universe.v1') throw new Error('E2E fixture must use universe.v1')
  const star = universe.stars?.[0]
  const questionSeed = universe.questions?.[0]
  const probeSeed = universe.probes?.[0]
  if (!star || !questionSeed || !probeSeed) throw new Error('E2E fixture is missing stress seeds')
  const questions = Array.from({ length: seed.stress.questionCount }, (_, index) => ({
    ...questionSeed,
    id: index === 0 ? questionSeed.id : `question:${70_000 + index}`,
    questionId: index === 0 ? questionSeed.questionId : String(70_000 + index),
    title: index === 0 ? questionSeed.title : `固定压力问题 ${index + 1}`,
    url: index === 0 ? questionSeed.url : `https://www.zhihu.com/question/${70_000 + index}`,
    answerIds: index === 0 ? questionSeed.answerIds : [],
  }))
  const probes = Array.from({ length: seed.stress.probeCount }, (_, index) => ({
    ...probeSeed,
    id: index === 0 ? probeSeed.id : `article:${90_000 + index}`,
    title: index === 0 ? probeSeed.title : `固定压力文章 ${index + 1}`,
    url: index === 0 ? probeSeed.url : `https://zhuanlan.zhihu.com/p/${90_000 + index}`,
  }))
  const expandedUniverse = {
    ...universe,
    meta: { ...universe.meta, items: questions.length + probes.length },
    stars: [{
      ...star,
      n: questions.length + probes.length,
      questionIds: questions.map(({ id }) => id),
      probeIds: probes.map(({ id }) => id),
    }],
    questions,
    probes,
  }
  return {
    ...seed,
    generation: { ...seed.generation, universe: expandedUniverse },
  }
}

export const universeFixture = expandStressFixture(fixtureSeed)

export async function installUniverseFixture(page: Page): Promise<E2EUniverseFixture> {
  await page.route('**/api/universe', (route) => route.fulfill({
    json: universeFixture.generation,
  }))
  return universeFixture
}
