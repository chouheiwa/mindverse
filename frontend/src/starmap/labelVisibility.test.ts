import { describe, expect, test } from 'vitest'
import type { Cluster } from '../types'
import { LabelStrategyCache, starLabelOpacity, visibleClusterLabels, visibleStarLabels } from './labelVisibility'
import type { StarDatum } from './gl/starData'

const cluster = (g: number, n: number): Cluster => ({
  g, n, name: `c${g}`, lead: '', c: [0, 0, 0], o: 0, f: 0, hue: 0, sat: 0, mem: [],
})

describe('visibleClusterLabels', () => {
  test('uses stable population ordering and caps panorama at seven', () => {
    const input = [cluster(0, 4), cluster(1, 9), cluster(2, 9), cluster(3, 8), cluster(4, 7), cluster(5, 6), cluster(6, 5), cluster(7, 3)]
    expect(visibleClusterLabels(input, null).map((c) => c.g)).toEqual([1, 2, 3, 4, 5, 6, 0])
    expect(input.map((c) => c.g)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })

  test('shows all five clusters and only the focused cluster when focused', () => {
    const input = [cluster(0, 1), cluster(1, 5), cluster(2, 3), cluster(3, 4), cluster(4, 2)]
    expect(visibleClusterLabels(input, null)).toHaveLength(5)
    expect(visibleClusterLabels(input, 3).map((c) => c.g)).toEqual([3])
  })
})

describe('starLabelOpacity', () => {
  test('starts at 18px and is fully visible at 42px', () => {
    expect(starLabelOpacity(17.99)).toBe(0)
    expect(starLabelOpacity(18)).toBe(0)
    expect(starLabelOpacity(30)).toBeCloseTo(0.5)
    expect(starLabelOpacity(42)).toBe(1)
    expect(starLabelOpacity(99)).toBe(1)
  })
})

test('star-label owner opacity switches a to b and restores panorama on null', () => {
  const stars = [
    { s: { c: 'a', g: 3 } },
    { s: { c: 'b', g: 3 } },
    { s: { c: 'outside', g: 4 } },
  ] as StarDatum[]
  expect(visibleStarLabels(stars, stars[0]).map(({ star, opacity }) => [star.s.c, opacity]))
    .toEqual([['a', 1], ['b', 0.12]])
  expect(visibleStarLabels(stars, stars[1]).map(({ star, opacity }) => [star.s.c, opacity]))
    .toEqual([['a', 0.12], ['b', 1]])
  expect(visibleStarLabels(stars, null)).toEqual([])
})

test('label strategy caches frame reads and invalidates only on focus changes', () => {
  const clusters = [cluster(3, 2), cluster(4, 1)]
  const stars = [
    { s: { c: 'a', g: 3 } },
    { s: { c: 'b', g: 3 } },
    { s: { c: 'outside', g: 4 } },
  ] as StarDatum[]
  const cache = new LabelStrategyCache(clusters, stars)
  const panorama = cache.clusterLabels
  const panoramaStars = cache.starLabels
  for (let frame = 0; frame < 120; frame++) {
    expect(cache.clusterLabels).toBe(panorama)
    expect(cache.starLabels).toBe(panoramaStars)
  }
  expect(cache.revision).toBe(0)

  cache.setFocus(stars[0])
  expect(cache.revision).toBe(1)
  expect(cache.clusterLabels.map((item) => item.g)).toEqual([3])
  expect(cache.starLabels.map(({ star, opacity }) => [star.s.c, opacity])).toEqual([['a', 1], ['b', 0.12]])
  const focusedA = cache.clusterLabels
  cache.setFocus(stars[0])
  expect(cache.revision).toBe(1)
  expect(cache.clusterLabels).toBe(focusedA)

  cache.setFocus(stars[1])
  expect(cache.revision).toBe(2)
  expect(cache.starLabels.map(({ star, opacity }) => [star.s.c, opacity])).toEqual([['a', 0.12], ['b', 1]])
  cache.setFocus(null)
  expect(cache.revision).toBe(3)
  expect(cache.clusterLabels).toEqual(panorama)
  expect(cache.starLabels).toEqual([])
})
