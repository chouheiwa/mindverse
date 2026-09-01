import { afterEach, expect, test } from 'vitest'
import { forcedE2EQuality, installE2EDiagnostics, recordE2EFrame, removeE2EDiagnostics } from './e2eDiagnostics'

afterEach(() => {
  delete window.__MINDVERSE_E2E__
})

test('accepts every production quality tier and rejects unrelated input', () => {
  expect(forcedE2EQuality('?e2eQuality=high')).toBe('high')
  expect(forcedE2EQuality('?e2eQuality=medium')).toBe('medium')
  expect(forcedE2EQuality('?e2eQuality=low')).toBe('low')
  expect(forcedE2EQuality('?e2eQuality=ultra')).toBeNull()
})

test('retains a full 30-second 60fps performance window as read-only snapshots', () => {
  const owner = {}
  installE2EDiagnostics(owner, 'medium', () => ({ geometries: 9, textures: 3 }), () => ({
    planetCount: 512, probeCount: 300, probeNearVisible: true, firstStarX: 320, firstStarY: 180,
  }))
  for (let index = 0; index < 1_800; index += 1) recordE2EFrame(owner, 16 + (index % 3))
  const first = window.__MINDVERSE_E2E__!.snapshot()
  expect(first.frameTimes).toHaveLength(1_800)
  expect(first.scene).toEqual({
    planetCount: 512, probeCount: 300, probeNearVisible: true, firstStarX: 320, firstStarY: 180,
  })
  first.frameTimes.length = 0
  first.scene.planetCount = 0
  expect(window.__MINDVERSE_E2E__!.snapshot()).toMatchObject({
    frameTimes: { length: 1_800 },
    scene: { planetCount: 512 },
  })
  removeE2EDiagnostics(owner)
  expect(window.__MINDVERSE_E2E__).toBeUndefined()
})
