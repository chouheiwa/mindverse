import { describe, expect, test } from 'vitest'
import { focusOpacity, ownerOpacity } from './focusEmphasis'
import * as THREE from 'three'
import type { CurrentStar, Universe } from '../types'
import type { UniverseIndex } from '../domain/universe'
import { makeBodies } from './gl/bodies'
import { makeRings } from './gl/rings'
import { makeOverlay3D } from './gl/overlay3d'

describe('focus emphasis', () => {
  test('keeps everything unchanged without focus', () => {
    expect([0, 1, 2].map((owner) => ownerOpacity(owner, null))).toEqual([1, 1, 1])
  })

  test('uses one shared 0.12 multiplier outside the focused owner', () => {
    expect([0, 1, 2].map((owner) => ownerOpacity(owner, 1))).toEqual([0.12, 1, 0.12])
    expect(focusOpacity(false, true)).toBe(0.12)
    expect(focusOpacity(true, true)).toBe(1)
  })

  test('restores exact arrays across a to b to null transitions', () => {
    const owners = [4, 4, 8, 9]
    expect(owners.map((owner) => ownerOpacity(owner, 4))).toEqual([1, 1, 0.12, 0.12])
    expect(owners.map((owner) => ownerOpacity(owner, 8))).toEqual([0.12, 0.12, 1, 0.12])
    expect(owners.map((owner) => ownerOpacity(owner, null))).toEqual([1, 1, 1, 1])
  })
})

const star = (id: string, g: number, p: [number, number, number], questionId: string): CurrentStar => ({
  id, c: id, g, p, n: 3, o: 1, f: 1, hue: 200, sat: 0.5, pe: 0, bu: 0,
  fi: '', la: '', ev: [], scope: 'public', externalQueryAllowed: false, questionIds: [questionId], probeIds: [],
})

const stars = [star('a', 1, [10, 0, 0], 'qa'), star('b', 2, [110, 0, 0], 'qb')]
const universe = {
  schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
  meta: { items: 0, concepts: 2, clusters: 2, own: 0, fav: 0, span: [0, 0], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [
    { g: 1, name: 'one', lead: 'a', c: [0, 0, 0] as [number, number, number], n: 2, o: 0, f: 0, hue: 0, sat: 0, mem: ['a'] },
    { g: 2, name: 'two', lead: 'b', c: [100, 0, 0] as [number, number, number], n: 1, o: 0, f: 0, hue: 0, sat: 0, mem: ['b'] },
  ],
  stars,
  particles: [], solo: [], nebula: [], probes: [], answers: [],
  questions: [
    { id: 'qa', questionId: 'qa', title: 'qa', url: '', answerIds: [] },
    { id: 'qb', questionId: 'qb', title: 'qb', url: '', answerIds: [] },
  ],
  wormholes: [{ a: 1, b: 2, an: 'one', bn: 'two', obs: 1, exp: 0, z: 1, ev: [] }],
  dark: [
    { c: 'a', n: 1, f: 1, o: 0, gap: 0, first: '', last: '', ev: [] },
    { c: 'b', n: 1, f: 1, o: 0, gap: 0, first: '', last: '', ev: [] },
  ],
} satisfies Universe

const index: UniverseIndex = {
  universe,
  starsById: new Map(stars.map((item) => [item.id, item])),
  questionsById: new Map(universe.questions.map((item) => [item.id, item])),
  answersById: new Map(), probesById: new Map(),
}

const values = (attribute: THREE.BufferAttribute) => Array.from(attribute.array as Float32Array)

test('body planet/orbit emphasis restores exact instance arrays across a to b to null', () => {
  const layer = makeBodies(index, true)
  const attrs = layer.group.children
    .map((child) => (child as THREE.Mesh).geometry as THREE.BufferGeometry)
    .filter((geometry) => geometry.getAttribute('iDim'))
    .map((geometry) => geometry.getAttribute('iDim') as THREE.BufferAttribute)
  layer.setFocus('a')
  expect(attrs.map(values)).toEqual([[1, Math.fround(0.12)], [1, Math.fround(0.12)]])
  layer.setFocus('b')
  expect(attrs.map(values)).toEqual([[Math.fround(0.12), 1], [Math.fround(0.12), 1]])
  layer.setFocus(null)
  expect(attrs.map(values)).toEqual([[1, 1], [1, 1]])
  layer.dispose()
})

test('cluster rings restore exact emphasis across a to b to null', () => {
  const layer = makeRings(universe)
  expect(layer).not.toBeNull()
  const attr = (layer!.object.geometry as THREE.BufferGeometry).getAttribute('aDim') as THREE.BufferAttribute
  const current = 192
  const other = 192
  layer!.setFocus(1)
  expect(values(attr)).toEqual([...Array(current).fill(1), ...Array(other).fill(Math.fround(0.12))])
  layer!.setFocus(2)
  expect(values(attr)).toEqual([...Array(current).fill(Math.fround(0.12)), ...Array(other).fill(1)])
  layer!.setFocus(null)
  expect(values(attr)).toEqual(Array(current + other).fill(1))
  layer!.dispose()
})

test('wormhole and dark-matter helpers restore exact emphasis across a to b to null', () => {
  const layer = makeOverlay3D(universe)
  const attrs = layer.group.children.map((child) => ((child as THREE.Mesh).geometry as THREE.BufferGeometry).getAttribute('aFocus') as THREE.BufferAttribute)
  layer.setFocus(stars[0])
  expect(attrs.map(values)).toEqual([
    [...Array(95).fill(1), ...Array(95).fill(Math.fround(0.12))],
    [...Array(6).fill(1), ...Array(6).fill(Math.fround(0.12))],
  ])
  layer.setFocus(stars[1])
  expect(attrs.map(values)).toEqual([
    [...Array(95).fill(Math.fround(0.12)), ...Array(95).fill(1)],
    [...Array(6).fill(Math.fround(0.12)), ...Array(6).fill(1)],
  ])
  layer.setFocus(null)
  expect(attrs.map(values)).toEqual([Array(190).fill(1), Array(12).fill(1)])
  layer.dispose()
})
