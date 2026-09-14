import { expect, it } from 'vitest'
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { createTerrainField } from './terrainField'
import { rotateTerrainField } from './rotatedTerrain'

it('preserves orbital terrain heights and normals after a quarter turn', () => {
  const field = createTerrainField({ seed: 42, octaves: 2, warpStrength: 0.1, faultStrength: 0.2,
    detailDensity: 1, largeCraters: [], qualityLevel: 0, smallCraterThreshold: 0.5 })
  const turned = rotateTerrainField(field, Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2))
  expect(turned.height([0, 0, -1])).toBeCloseTo(field.height([1, 0, 0]), 8)
  expect(turned.sample([0, 0, -1]).height).toBeCloseTo(field.sample([1, 0, 0]).height, 8)
  const normal = field.normal([1, 0, 0], 0.01, 0.1)
  const rotated = turned.normal([0, 0, -1], 0.01, 0.1)
  expect(rotated[0]).toBeCloseTo(normal[2], 8)
  expect(rotated[1]).toBeCloseTo(normal[1], 8)
  expect(rotated[2]).toBeCloseTo(-normal[0], 8)
})
