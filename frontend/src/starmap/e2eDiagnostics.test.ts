import { afterEach, expect, test } from 'vitest'
import {
  E2E_FRAME_CAPACITY,
  forcedE2EQuality,
  installE2EDiagnostics,
  recordE2EFrame,
  removeE2EDiagnostics,
} from './e2eDiagnostics'

afterEach(() => {
  delete window.__MINDVERSE_E2E__
})

test('accepts every production quality tier and rejects unrelated input', () => {
  expect(forcedE2EQuality('?e2eQuality=high')).toBe('high')
  expect(forcedE2EQuality('?e2eQuality=medium')).toBe('medium')
  expect(forcedE2EQuality('?e2eQuality=low')).toBe('low')
  expect(forcedE2EQuality('?e2eQuality=ultra')).toBeNull()
})

function installDiagnostics() {
  const owner = {}
  installE2EDiagnostics(owner, 'medium', () => ({ geometries: 9, textures: 3 }), () => ({
    planetCount: 512, probeCount: 300, probeNearVisible: true, firstStarX: 320, firstStarY: 180,
  }))
  return owner
}

test.each([120, 144, 240])('retains a full 30-second window at %iHz with monotonic timing and no dropped samples', (refreshRate) => {
  const owner = installDiagnostics()
  const sampleCount = refreshRate * 30 + 1
  for (let index = 0; index < sampleCount; index += 1) {
    recordE2EFrame(owner, 1_000 / refreshRate, 0, index * 1_000 / refreshRate)
  }
  const first = window.__MINDVERSE_E2E__!.snapshot()
  expect(first.frameTimes).toHaveLength(sampleCount)
  expect(first.frames).toEqual({
    firstSequence: 0,
    nextSequence: sampleCount,
    dropped: 0,
    firstTimestampMs: 0,
    lastTimestampMs: 30_000,
  })
  expect(first.scene).toEqual({
    planetCount: 512, probeCount: 300, probeNearVisible: true, firstStarX: 320, firstStarY: 180,
  })
  first.frameTimes.length = 0
  first.scene.planetCount = 0
  expect(window.__MINDVERSE_E2E__!.snapshot()).toMatchObject({
    frameTimes: { length: sampleCount },
    frames: { firstSequence: 0, nextSequence: sampleCount, dropped: 0 },
    scene: { planetCount: 512 },
  })
  removeE2EDiagnostics(owner)
  expect(window.__MINDVERSE_E2E__).toBeUndefined()
})

test('retains 35 seconds at 240Hz and reports the first overflow', () => {
  expect(E2E_FRAME_CAPACITY).toBe(35 * 240)
  const owner = installDiagnostics()
  for (let index = 0; index < E2E_FRAME_CAPACITY; index += 1) {
    recordE2EFrame(owner, 1, 0, index)
  }
  expect(window.__MINDVERSE_E2E__!.snapshot().frames).toMatchObject({
    firstSequence: 0,
    nextSequence: E2E_FRAME_CAPACITY,
    dropped: 0,
  })
  recordE2EFrame(owner, 1, 0, E2E_FRAME_CAPACITY)
  expect(window.__MINDVERSE_E2E__!.snapshot().frames).toMatchObject({
    firstSequence: 1,
    nextSequence: E2E_FRAME_CAPACITY + 1,
    dropped: 1,
  })
})
