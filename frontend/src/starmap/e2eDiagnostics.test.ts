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
    cameraDistance: 16, targetDistance: 4.5,
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
    cameraDistance: 16, targetDistance: 4.5,
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

test('retains the closed 35-second interval at 240Hz and reports the first overflow', () => {
  const closedIntervalSamples = 35 * 240 + 1
  expect(E2E_FRAME_CAPACITY).toBe(closedIntervalSamples)
  const owner = installDiagnostics()
  for (let index = 0; index < closedIntervalSamples; index += 1) {
    recordE2EFrame(owner, 1_000 / 240, 0, index * 1_000 / 240)
  }
  expect(window.__MINDVERSE_E2E__!.snapshot().frames).toEqual({
    firstSequence: 0,
    nextSequence: closedIntervalSamples,
    dropped: 0,
    firstTimestampMs: 0,
    lastTimestampMs: 35_000,
  })
  recordE2EFrame(owner, 1_000 / 240, 0, closedIntervalSamples * 1_000 / 240)
  expect(window.__MINDVERSE_E2E__!.snapshot().frames).toMatchObject({
    firstSequence: 1,
    nextSequence: closedIntervalSamples + 1,
    dropped: 1,
  })
})

test('linearizes duration, timestamp and sequence in logical order after ring wrap-around', () => {
  const owner = installDiagnostics()
  for (let index = 0; index < E2E_FRAME_CAPACITY + 3; index += 1) {
    recordE2EFrame(owner, index + 0.5, 0, index * 10)
  }
  const snapshot = window.__MINDVERSE_E2E__!.snapshot()
  expect(snapshot.frames).toEqual({
    firstSequence: 3,
    nextSequence: E2E_FRAME_CAPACITY + 3,
    dropped: 3,
    firstTimestampMs: 30,
    lastTimestampMs: (E2E_FRAME_CAPACITY + 2) * 10,
  })
  expect(snapshot.frameTimes).toHaveLength(E2E_FRAME_CAPACITY)
  expect(snapshot.frameTimes.slice(0, 3)).toEqual([3.5, 4.5, 5.5])
  expect(snapshot.frameTimes.at(-1)).toBe(E2E_FRAME_CAPACITY + 2.5)
  expect(snapshot.frameTimestampsMs.slice(0, 3)).toEqual([30, 40, 50])
  expect(snapshot.frameTimestampsMs.at(-1)).toBe((E2E_FRAME_CAPACITY + 2) * 10)
  expect(snapshot.frameSequences.every((sequence, index) => sequence === index + 3)).toBe(true)
})

test('retains a complete post-warm 30-second window after startup samples already overflowed', () => {
  const owner = installDiagnostics()
  const startupSamples = E2E_FRAME_CAPACITY + 100
  for (let index = 0; index < startupSamples; index += 1) {
    recordE2EFrame(owner, 1_000 / 240, 0, index * 1_000 / 240)
  }
  const warm = window.__MINDVERSE_E2E__!.snapshot()
  expect(warm.frames.dropped).toBe(100)

  const windowSamples = 30 * 240
  for (let index = 1; index <= windowSamples; index += 1) {
    recordE2EFrame(owner, 1_000 / 240, 0, warm.frames.lastTimestampMs! + index * 1_000 / 240)
  }
  const final = window.__MINDVERSE_E2E__!.snapshot()
  expect(final.frames.dropped).toBeGreaterThan(warm.frames.dropped)
  expect(final.frames.firstSequence).toBeLessThanOrEqual(warm.frames.nextSequence)
  const windowDropped = Math.max(0, final.frames.firstSequence - warm.frames.nextSequence)
  const offset = warm.frames.nextSequence - final.frames.firstSequence
  const samples = final.frameTimes.slice(offset)
  expect(windowDropped).toBe(0)
  expect(samples).toHaveLength(final.frames.nextSequence - warm.frames.nextSequence)
  expect(samples).toHaveLength(windowSamples)
  expect(final.frames.lastTimestampMs! - warm.frames.lastTimestampMs!).toBe(30_000)
})
