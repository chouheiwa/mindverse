import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { describe, expect, test, vi } from 'vitest'
import { BabylonRenderer } from './BabylonRenderer'

describe('returning from the surface', () => {
  test.each(['descending', 'walking', 'digging'] as const)('restores the orbit camera after %s, including planet drift', (phase) => {
    const engine = new NullEngine()
    const scene = new Scene(engine)
    try {
      const camera = new ArcRotateCamera('test', 1.2, 0.9, 8, new Vector3(10, 2, 3), scene)
      const renderer = Object.create(BabylonRenderer.prototype) as any
      renderer.camera = camera
      renderer.surfaceStage = { phase, questionId: 'q', landing: [0, 1, 0] }
      renderer.surfaceReturnPose = {
        alpha: camera.alpha, beta: camera.beta, radius: camera.radius,
        target: camera.target.clone(), centre: new Vector3(10, 2, 3),
      }
      renderer.selectedVisual = { visual: { activeMesh: { position: new Vector3(12, 3, 4) } } }
      renderer.syncOrbitPresentation = vi.fn()
      renderer.disposeSurfaceWorld = vi.fn()
      renderer.applySurfaceVisibility = vi.fn(() => { camera.upVector = Vector3.Up() })
      renderer.surfaceDescent = {}
      camera.upVector = new Vector3(1, 0, 0)
      camera.setTarget(new Vector3(10.1, 2, 3.1))
      camera.setPosition(new Vector3(10.12, 2.01, 3.12))
      camera.inertialAlphaOffset = 0.3
      camera.inertialRadiusOffset = 0.2

      renderer.exitPlanetSurface()
      camera.getViewMatrix(true)

      expect(camera.radius).toBeCloseTo(8)
      expect(camera.alpha).toBeCloseTo(1.2)
      expect(camera.beta).toBeCloseTo(0.9)
      expect(camera.target.asArray()).toEqual([12, 3, 4])
      expect(camera.upVector.asArray()).toEqual([0, 1, 0])
      expect(camera.inertialAlphaOffset).toBe(0)
      expect(camera.inertialRadiusOffset).toBe(0)
      expect(renderer.syncOrbitPresentation).toHaveBeenCalledOnce()
      expect(renderer.surfaceReturnPose).toBeNull()
      expect(renderer.surfaceDescent).toBeNull()
      renderer.exitPlanetSurface()
      expect(renderer.disposeSurfaceWorld).toHaveBeenCalledOnce()
    } finally {
      scene.dispose()
      engine.dispose()
    }
  })
})
