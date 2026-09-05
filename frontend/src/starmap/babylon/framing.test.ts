import { describe, expect, it } from 'vitest'
import {
  PANORAMA_DISTANCE_SCALE,
  PANORAMA_ENTRY_SCALE,
  PLANET_NEAR,
  SYSTEM_DISTANCE_FLOOR,
  SYSTEM_FRAME_FILL,
  SYSTEM_NEAR,
  THREE_VERTICAL_FOV,
  panoramaDistance,
  planetFocusDistance,
  sceneRadiusOf,
  systemDistance,
  THREE_PANORAMA_PITCH,
  THREE_PANORAMA_YAW,
  arcRotateFromYawPitch,
  wheelExitThreshold,
  wheelRadiusBounds,
} from './framing'

const star = (x: number, y: number, z: number) => ({ p: [x, y, z] as const })
const cluster = (x: number, y: number, z: number) => ({ c: [x, y, z] as const })

describe('sceneRadiusOf', () => {
  it('measures from the origin and keeps Three floor of 60', () => {
    // gl/scene.ts::sceneRadius — the layout is origin-centred, so a centroid
    // bounding box shrinks a single-star universe to nothing.
    expect(sceneRadiusOf([star(0, 0, 0)], [cluster(0, 0, 0)])).toBe(60)
    expect(sceneRadiusOf([star(0, 0, 0)], [])).toBe(60)
    expect(sceneRadiusOf([star(90, 0, 0)], [])).toBe(90)
    expect(sceneRadiusOf([star(0, 0, 0)], [cluster(0, 120, 0)])).toBe(120)
  })

  it('ignores non-finite coordinates instead of poisoning the scale', () => {
    expect(sceneRadiusOf([star(Number.NaN, 0, 0), star(0, 0, 80)], [])).toBe(80)
    expect(sceneRadiusOf([], [])).toBe(60)
  })
})

describe('panoramaDistance', () => {
  it('parks the camera at the Three overview distance', () => {
    expect(panoramaDistance(60)).toBeCloseTo(60 * PANORAMA_DISTANCE_SCALE, 6)
    expect(PANORAMA_ENTRY_SCALE).toBeGreaterThan(PANORAMA_DISTANCE_SCALE)
  })
})

describe('systemDistance', () => {
  it('recovers Three SYSTEM_DIST when given Three field of view', () => {
    // Three: outer orbit ~8 units, 60 degree FOV, distance 16.
    expect(systemDistance(8, THREE_VERTICAL_FOV)).toBeCloseTo(16, 0)
  })

  it('keeps the system filling the same share of frame at any field of view', () => {
    const wide = systemDistance(8, THREE_VERTICAL_FOV)
    const narrow = systemDistance(8, 0.8)
    // A narrower lens must back off, not crop the system.
    expect(narrow).toBeGreaterThan(wide)
    const fill = (distance: number, fov: number) => Math.atan(8 / distance) / (fov / 2)
    expect(fill(wide, THREE_VERTICAL_FOV)).toBeCloseTo(fill(narrow, 0.8), 4)
    expect(fill(wide, THREE_VERTICAL_FOV)).toBeCloseTo(SYSTEM_FRAME_FILL, 4)
  })

  it('never frames a sparse system closer than the Three constant', () => {
    // Three uses a flat SYSTEM_DIST = 16 because its orbit ladder always tops
    // out near 8 units. A two-planet system must not be framed twice as close
    // just because it happens to have fewer planets.
    expect(SYSTEM_DISTANCE_FLOOR).toBeCloseTo(16, 6)
    expect(systemDistance(3.4, THREE_VERTICAL_FOV)).toBeCloseTo(SYSTEM_DISTANCE_FLOOR, 6)
    expect(systemDistance(8, THREE_VERTICAL_FOV)).toBeCloseTo(SYSTEM_DISTANCE_FLOOR, 0)
    expect(systemDistance(104, THREE_VERTICAL_FOV)).toBeGreaterThan(SYSTEM_DISTANCE_FLOOR)
  })

  it('never collapses onto the star itself', () => {
    expect(systemDistance(0, THREE_VERTICAL_FOV)).toBeGreaterThanOrEqual(SYSTEM_NEAR)
    expect(systemDistance(Number.NaN, THREE_VERTICAL_FOV)).toBeGreaterThanOrEqual(SYSTEM_NEAR)
  })
})

describe('planetFocusDistance', () => {
  it('derives the distance from the orbit radius, not the planet radius', () => {
    // Three planetDist: the camera and the star sit the same order of magnitude
    // from the planet, so the star stays in frame as the light source.
    expect(planetFocusDistance(2.1)).toBeCloseTo(2.8, 6)
    expect(planetFocusDistance(5)).toBeCloseTo(4, 6)
    expect(planetFocusDistance(20)).toBeCloseTo(6, 6)
  })

  it('never returns the planet-radius framing that made the star a backdrop', () => {
    const planetRadius = 0.14
    for (const orbitR of [2.1, 3.25, 4.4, 8]) {
      expect(planetFocusDistance(orbitR)).toBeGreaterThan(planetRadius * 8)
    }
  })

  it('stays finite for degenerate orbits', () => {
    for (const orbitR of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const distance = planetFocusDistance(orbitR)
      expect(Number.isFinite(distance)).toBe(true)
      expect(distance).toBeGreaterThanOrEqual(2.8)
    }
  })
})

describe('wheel bounds', () => {
  it('gives each phase the Three floor and a shared ceiling', () => {
    const radius = 60
    expect(wheelRadiusBounds('panorama', { sceneRadius: radius })).toEqual({
      low: radius * 0.62, high: radius * PANORAMA_ENTRY_SCALE,
    })
    expect(wheelRadiusBounds('star-focus', { sceneRadius: radius }).low).toBe(SYSTEM_NEAR)
    expect(wheelRadiusBounds('planet-focus', { sceneRadius: radius }).low).toBe(PLANET_NEAR)
  })

  it('exits one level per outward wheel, matching the Three ladder', () => {
    const radius = 60
    const system = systemDistance(8, THREE_VERTICAL_FOV)
    expect(wheelExitThreshold('planet-focus', { sceneRadius: radius, systemDistance: system }))
      .toBeCloseTo(system * 0.85, 6)
    expect(wheelExitThreshold('star-focus', { sceneRadius: radius, systemDistance: system }))
      .toBeCloseTo(radius * 0.9, 6)
    expect(wheelExitThreshold('panorama', { sceneRadius: radius, systemDistance: system })).toBeNull()
  })
})

describe('arcRotateFromYawPitch', () => {
  /** Three positions its camera as focus + (sin y cos p, -sin p, cos y cos p) * dist. */
  const threeDirection = (yaw: number, pitch: number) => [
    Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch),
  ]
  /** Babylon places an ArcRotateCamera at target + (cos a sin b, cos b, sin a sin b) * radius. */
  const babylonDirection = (alpha: number, beta: number) => [
    Math.cos(alpha) * Math.sin(beta), Math.cos(beta), Math.sin(alpha) * Math.sin(beta),
  ]

  it('reproduces the Three opening camera direction exactly', () => {
    const { alpha, beta } = arcRotateFromYawPitch(THREE_PANORAMA_YAW, THREE_PANORAMA_PITCH)
    const expected = threeDirection(THREE_PANORAMA_YAW, THREE_PANORAMA_PITCH)
    const actual = babylonDirection(alpha, beta)
    for (let axis = 0; axis < 3; axis += 1) expect(actual[axis]!).toBeCloseTo(expected[axis]!, 9)
  })

  it('round-trips a spread of poses', () => {
    for (const yaw of [-1.2, 0, 0.5, 2.4]) {
      for (const pitch of [-0.9, -0.2, 0, 0.7]) {
        const { alpha, beta } = arcRotateFromYawPitch(yaw, pitch)
        const expected = threeDirection(yaw, pitch)
        const actual = babylonDirection(alpha, beta)
        for (let axis = 0; axis < 3; axis += 1) expect(actual[axis]!).toBeCloseTo(expected[axis]!, 9)
      }
    }
  })

  it('keeps beta inside the range an ArcRotateCamera accepts', () => {
    for (const pitch of [-1.5, 0, 1.5]) {
      const { beta } = arcRotateFromYawPitch(0.5, pitch)
      expect(beta).toBeGreaterThan(0)
      expect(beta).toBeLessThan(Math.PI)
    }
  })
})
