import { expect, test } from 'vitest'
import * as THREE from 'three'
import type { StarDatum } from './starData'
import { starWorldPosition } from './starData'
import { orbit, orbitPeriod } from '../projection'

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
