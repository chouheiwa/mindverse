import { expect, test } from 'vitest'
import { cinematicEnvironment } from './cinematic'
import { makeStillBloomEffect, stillCinematicEnvironment } from './still'

test('still bloom consumes the same high cinematic environment as its nebula', () => {
  const environment = stillCinematicEnvironment()
  expect(environment).toEqual({ ...cinematicEnvironment('high'), nebulaBake: 256 })
  expect(makeStillBloomEffect(environment).intensity).toBe(environment.bloom)
  expect(makeStillBloomEffect({ ...environment, bloom: 0.31 }).intensity).toBe(0.31)
})
