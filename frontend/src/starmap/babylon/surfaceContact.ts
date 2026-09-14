import type { Vector3 } from '@babylonjs/core/Maths/math.vector'

/** Contact with the currently visible terrain, in the surface root's local coordinates. */
export interface SurfaceContact {
  readonly point: Vector3
  readonly normal: Vector3
}
export type SurfaceContactSampler = (direction: Vector3) => SurfaceContact | null
