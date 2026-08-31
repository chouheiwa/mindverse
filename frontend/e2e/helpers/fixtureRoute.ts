import { readFileSync } from 'node:fs'
import type { Page } from '@playwright/test'
import type { WireGeneration } from '../../src/types'

export interface E2EUniverseFixture {
  generation: WireGeneration
  assertions: {
    minNonBackgroundPixels: number
    questionCount: number
    probeCount: number
  }
}

export const universeFixture = JSON.parse(
  readFileSync(new URL('../fixtures/universe.json', import.meta.url), 'utf8'),
) as E2EUniverseFixture

export async function installUniverseFixture(page: Page): Promise<E2EUniverseFixture> {
  await page.route('**/api/universe', (route) => route.fulfill({
    json: universeFixture.generation,
  }))
  return universeFixture
}
