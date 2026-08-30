// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { getGeneration, pollUntilDone, startGeneration } from './api'
import { createShare, deleteShare, getShare, previewShare } from './shareApi'
import { shareIdFromPath } from './shareRoute'
import { shareFixture } from './domain/share.test'

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
  test('propagates AbortSignal and never starts generation after an aborted initial GET', async () => {
    let resolveGet!: (response: Response) => void
    const fetchMock = vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveGet = resolve }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const pending = pollUntilDone(() => {}, controller.signal)
    controller.abort()
    resolveGet(new Response(JSON.stringify({ state: 'idle', stage: '', progress: 0, filtered: 0, source: 'mock', calls: 0 }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }))
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)

    fetchMock.mockResolvedValue(response(golden))
    await getGeneration(controller.signal).catch(() => undefined)
    await startGeneration(controller.signal).catch(() => undefined)
    expect(fetchMock.mock.calls.at(-2)?.[1].signal).toBe(controller.signal)
    expect(fetchMock.mock.calls.at(-1)?.[1].signal).toBe(controller.signal)
  })

  test('aborts the polling delay without issuing another GET', async () => {
    const wire = (state: 'idle' | 'running') => new Response(JSON.stringify({
      state, stage: '', progress: 0, filtered: 0, source: 'mock', calls: 0,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(wire('idle'))
      .mockResolvedValueOnce(wire('running'))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const pending = pollUntilDone(() => {}, controller.signal)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

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

  test('rejects every non-2xx response even when it carries a generation state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: 'failed', error: 'generation failed' }), { status: 500 })))
    await expect(getGeneration()).rejects.toThrow('generation failed')
  })
})

describe('share API boundary', () => {
  test('previews, creates, reads, and deletes with exact payloads', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...shareFixture, digest: 'd'.repeat(64) }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'public_1', url: '/s/public_1', expiresAt: '2026-09-07T00:00:00Z' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(shareFixture), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await previewShare(['question:7'])
    await createShare(['question:7'], 'd'.repeat(64))
    await getShare('public_1')
    await deleteShare('public_1')

    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/share/preview', '/api/share', '/api/share/public_1', '/api/share/public_1',
    ])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ questionIds: ['question:7'] })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ questionIds: ['question:7'], digest: 'd'.repeat(64) })
    expect(fetchMock.mock.calls[2][1].credentials).toBe('omit')
    expect(fetchMock.mock.calls[3][1].method).toBe('DELETE')
  })

  test('passes AbortSignal and rejects a malformed preview envelope', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...shareFixture, digest: 'short', stars: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(previewShare(['question:7'], controller.signal)).rejects.toThrow(/invalid share/)
    expect(fetchMock.mock.calls[0][1].signal).toBe(controller.signal)
  })

  test('rejects malformed create metadata instead of exposing an unsafe URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'public_1', url: 'https://evil.test/s/public_1', expiresAt: 'not-a-time', owner: 'private',
    }), { status: 200 })))
    await expect(createShare(['question:7'], 'd'.repeat(64))).rejects.toThrow(/invalid created share/)
  })

  test('rejects any delete response other than the exact success envelope', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, owner: 'private' }), { status: 200 })))
    await expect(deleteShare('public_1')).rejects.toThrow(/invalid share deletion/)
  })

  test.each([
    ['/s/abc_123-Z', 'abc_123-Z'],
    ['/s/abc/', null],
    ['/s/abc/trailing', null],
    ['/s/%61bc', null],
    ['/prefix/s/abc', null],
    ['/s/', null],
  ])('parses an anchored public route %s', (path, expected) => {
    expect(shareIdFromPath(path)).toBe(expected)
  })
})
