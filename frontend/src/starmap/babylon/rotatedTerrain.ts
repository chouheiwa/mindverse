import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Vec3 } from './cubeSphere'
import type { PlanetTerrainField } from './terrainField'

/** Freeze the orbital orientation into the world-space terrain used for landing and walking. */
export function rotateTerrainField(field: PlanetTerrainField, rotation: Quaternion): PlanetTerrainField {
  const world = Matrix.Compose(Vector3.One(), rotation, Vector3.Zero())
  const local = world.clone().invert()
  const transform = (value: Vec3, matrix: Matrix): Vec3 => {
    const result = Vector3.TransformNormal(Vector3.FromArray(value), matrix)
    return [result.x, result.y, result.z]
  }
  return Object.freeze({
    height: (direction: Vec3) => field.height(transform(direction, local)),
    sample: (direction: Vec3) => field.sample(transform(direction, local)),
    normal: (direction: Vec3, epsilon?: number, displacement?: number) =>
      transform(field.normal(transform(direction, local), epsilon, displacement), world),
  })
}
