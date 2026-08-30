// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getGeneration } from './api'

const goldenPath = new URL('../../internal/engine/testdata/universe_contract.json', import.meta.url)
const golden: unknown = JSON.parse(readFileSync(goldenPath, 'utf8'))

const response = (universe: unknown) => new Response(JSON.stringify({
  state: 'done',
  stage: '完成',
  progress: 100,
  universe,
  filtered: 0,
  source: 'test',
  calls: 1,
}), { status: 200, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.unstubAllGlobals())

describe('/api/universe boundary', () => {
  test('normalizes the actual Go golden before returning data to the UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(golden)))

    const generation = await getGeneration()

    expect(generation.universe?.wormholes).toEqual([])
    expect(generation.universe?.solo).toEqual([])
    expect(generation.universe?.dark).toEqual([])
    expect(generation.universe?.nebula).toEqual([])
    expect(generation.universe?.stars[1].ev).toEqual([])
    expect(Object.isFrozen(generation.universe)).toBe(true)
  })

  test('rejects malformed universe fields instead of passing them to the renderer', async () => {
    const malformed = structuredClone(golden) as Record<string, unknown>
    malformed.renamedQuestions = malformed.questions
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(malformed)))

    await expect(getGeneration()).rejects.toThrow(/unknown key renamedQuestions/)
  })
})
