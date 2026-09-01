import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { StarDatum } from './starData'
import { IGNITE_START, IGNITE_STEP, starData, starWorldPosition } from './starData'
import { orbit, orbitPeriod } from '../projection'
import type { Universe } from '../../types'

test('star world position matches the shader orbit and bob at non-zero elapsed time', () => {
  const p: [number, number, number] = [8, 2, -3]
  const center: [number, number, number] = [1, -2, 4]
  const datum = {
    p, center, axis: [0, 1, 0], period: orbitPeriod(p, center),
    seed: 7,
  } as StarDatum
  const elapsed = 2317
  const expectedOrbit = orbit(datum.p, datum.center, datum.axis, elapsed)
  const bob = Math.sin(elapsed / (6400 + ((datum.seed * 311) % 5200)) + datum.seed) * 1.35
  const out = new THREE.Vector3()
  expect(starWorldPosition(datum, elapsed, 1.35, out).toArray()).toEqual([
    expectedOrbit[0] + datum.axis[0] * bob,
    expectedOrbit[1] + datum.axis[1] * bob,
    expectedOrbit[2] + datum.axis[2] * bob,
  ])
})

test('genesis ignition keeps modern stars with the same concept independently scheduled', () => {
  const base = {
    c: 'same', g: 0, p: [0, 0, 0] as [number, number, number], n: 10, o: 1, f: 0,
    hue: 218, sat: 50, pe: 1, bu: 0, fi: '', la: '', ev: [],
    externalQueryAllowed: false, questionIds: [], probeIds: [],
  }
  const universe = {
    schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
    meta: { items: 2, concepts: 2, clusters: 1, own: 0, fav: 0, span: [0, 0], medz: 0, p10z: 0, source: 'test', splits: 0 },
    clusters: [{ g: 0, name: 'cluster', lead: '', c: [0, 0, 0], n: 2, o: 0, f: 0, hue: 0, sat: 0, mem: [] }],
    stars: [
      { ...base, id: 'star:v1:private:same', scope: 'private' as const },
      { ...base, id: 'star:v1:public:same', scope: 'public' as const, p: [1, 0, 0] as [number, number, number], n: 1, pe: 0.1 },
    ],
    questions: [], answers: [], probes: [], particles: [], wormholes: [], solo: [], dark: [], nebula: [],
  } as Universe
  expect(starData(universe).map(({ ignite }) => ignite)).toEqual([IGNITE_START, IGNITE_START + IGNITE_STEP])
})
