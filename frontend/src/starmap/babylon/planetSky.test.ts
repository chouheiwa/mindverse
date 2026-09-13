import { afterEach, describe, expect, it, vi } from 'vitest'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { PlanetSky, PLANET_SKY_UNIFORMS } from './planetSky'

const cleanup: (() => void)[] = []
afterEach(() => { cleanup.splice(0).forEach(dispose => dispose()) })
function setup() {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const parent = new TransformNode('planet', scene)
  const camera = new FreeCamera('camera', new Vector3(0, 10, 0), scene)
  scene.activeCamera = camera
  const sky = new PlanetSky(scene, parent)
  cleanup.push(() => { sky.dispose(); scene.dispose(); engine.dispose() })
  return { scene, parent, camera, sky }
}

describe('PlanetSky', () => {
  it('registers every uniform and renders inward without depth writes', () => {
    const { sky } = setup()
    expect(sky.material.options.uniforms).toEqual([...PLANET_SKY_UNIFORMS])
    expect(sky.material.disableDepthWrite).toBe(true)
    expect(sky.material.backFaceCulling).toBe(true)
    const positions = sky.mesh.getVerticesData('position')!
    const normals = sky.mesh.getVerticesData('normal')!
    expect(positions[0]! * normals[0]! + positions[1]! * normals[1]! + positions[2]! * normals[2]!).toBeLessThan(0)
    // 天空交给常规管线画，不再手动调 mesh.render —— 那要用还没准备好的场景变换
    // 矩阵，真引擎上会抛「reading 'm'」而 NullEngine 测不出来。
    expect(sky.mesh.infiniteDistance).toBe(true)
    expect(sky.mesh.applyFog).toBe(false)
  })

  it('hides at zero dim and clamps nonfinite or excessive input', () => {
    const { sky } = setup()
    sky.setDim(0)
    expect(sky.mesh.isVisible).toBe(false)
    sky.setDim(Number.NaN)
    expect(sky.diagnostics().dim).toBe(0)
    sky.setDim(4)
    expect(sky.diagnostics().dim).toBe(1)
    expect(sky.mesh.isVisible).toBe(true)
  })

  it('removes owned resources and its draw observer, with idempotent disposal', () => {
    const { scene, parent, sky } = setup()
    const before = scene.onBeforeDrawPhaseObservable.observers.length
    sky.dispose()
    expect(scene.meshes).not.toContain(sky.mesh)
    expect(scene.materials).not.toContain(sky.material)
    expect(scene.onBeforeDrawPhaseObservable.observers.filter(o => !o._willBeUnregistered)).toHaveLength(before - 1)
    expect(parent.isDisposed()).toBe(false)
    expect(() => sky.dispose()).not.toThrow()
    expect(sky.diagnostics().visible).toBe(false)
  })

  it('writes finite uniforms for degenerate sun and thermal input', () => {
    const { sky } = setup()
    const vectorSpy = vi.spyOn(sky.material, 'setVector3')
    const floatSpy = vi.spyOn(sky.material, 'setFloat')
    for (const sun of [[0, 0, 0], [Number.NaN, Infinity, 0], [Number.MAX_VALUE, Number.MAX_VALUE, 0]] as const) sky.setSun(sun)
    sky.setThermal({ magma: Number.NaN, desert: Infinity, rock: -1, tundra: 0, ice: 0 })
    sky.setDim(Number.NaN)
    for (const [, vector] of vectorSpy.mock.calls) expect([vector.x, vector.y, vector.z].every(Number.isFinite)).toBe(true)
    for (const [, value] of floatSpy.mock.calls) expect(Number.isFinite(value)).toBe(true)
    expect(sky.diagnostics().horizon).toEqual([0.31, 0.34, 0.40])
  })

  it('follows camera translation and radial up without inheriting rotation', () => {
    const { scene, camera, parent, sky } = setup()
    const draw = vi.spyOn(sky.mesh, 'render').mockReturnValue(sky.mesh)
    parent.position.set(5, 0, 0)
    parent.rotation.set(1, 2, 3)
    parent.computeWorldMatrix(true)
    camera.position.set(15, 0, 0)
    camera.rotation.set(0.2, 0.4, 0.6)
    camera.getViewMatrix(true)
    scene.onBeforeDrawPhaseObservable.notifyObservers(scene)
    // infiniteDistance：位置留在原点，跟随相机由 Babylon 的零平移视图矩阵完成。
    // 之前把位置设成相机位置，球心跑到两倍相机位移处，相机在球外，天空只剩一个球面。
    expect(sky.mesh.infiniteDistance).toBe(true)
    expect(sky.mesh.position.asArray()).toEqual([0, 0, 0])
    expect(sky.mesh.rotation.asArray()).toEqual([0, 0, 0])
    sky.diagnostics().up.forEach((value, i) => expect(value).toBeCloseTo(i === 0 ? 1 : 0, 6))
    // 绝不手动绘制：这一条是回归闸，防止有人再把 mesh.render 放回 draw phase。
    expect(draw).not.toHaveBeenCalled()
    sky.setDim(0)
    scene.onBeforeDrawPhaseObservable.notifyObservers(scene)
    expect(draw).not.toHaveBeenCalled()
  })

  it('reads as a daytime sky, not a black void', () => {
    // 之前天顶 = 地平线 × (0.12, 0.18, 0.3)，岩石行星的天顶亮度 ≈ 0.05 —— 站在地表上
    // 抬头是一片黑，读起来就是「还在宇宙里」。
    const { sky } = setup()
    const lum = (c: readonly number[]) => c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722
    for (const key of ['magma', 'desert', 'rock', 'tundra', 'ice'] as const) {
      sky.setThermal({ magma: 0, desert: 0, rock: 0, tundra: 0, ice: 0, [key]: 1 })
      expect(lum(sky.diagnostics().zenith), key).toBeGreaterThan(0.14)
    }
  })

  it('keeps every thermal zenith darker than its horizon', () => {
    const { sky } = setup()
    for (const key of ['magma', 'desert', 'rock', 'tundra', 'ice'] as const) {
      sky.setThermal({ magma: 0, desert: 0, rock: 0, tundra: 0, ice: 0, [key]: 1 })
      const { zenith, horizon } = sky.diagnostics()
      zenith.forEach((value, i) => expect(value).toBeLessThan(horizon[i]!))
    }
  })

  it('hides the sun disc once it drops below the horizon', () => {
    // 之前天空只有一条 mix，太阳没有实体。加了日面就必须保证它不会透地。
    const { sky } = setup()
    sky.setSun([0, 1, 0])
    expect(sky.diagnostics().sunDiscGain).toBeCloseTo(1, 6)
    sky.setSun([1, 0, 0])
    expect(sky.diagnostics().sunDiscGain).toBeGreaterThan(0)
    sky.setSun([0, -1, 0])
    expect(sky.diagnostics().sunDiscGain).toBe(0)
    expect(sky.diagnostics().daylight).toBe(0)
  })

  it('dims monotonically as the sun sinks', () => {
    const { sky } = setup()
    let previous = Number.POSITIVE_INFINITY
    for (let elevation = 1; elevation >= -1.0001; elevation -= 0.1) {
      sky.setSun([Math.sqrt(Math.max(0, 1 - elevation * elevation)), elevation, 0])
      const now = sky.diagnostics().daylight
      expect(now).toBeLessThanOrEqual(previous + 1e-9)
      expect(now).toBeGreaterThanOrEqual(0)
      expect(now).toBeLessThanOrEqual(1)
      previous = now
    }
    expect(previous).toBe(0)
  })

  it('keeps the horizon brighter and warmer than the zenith for every thermal', () => {
    // 地平线看穿的空气最厚 —— 它必须更亮、更暖，否则天读起来还是一张平涂的纸。
    const { sky } = setup()
    const lum = (c: readonly number[]) => c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722
    for (const key of ['magma', 'desert', 'rock', 'tundra', 'ice'] as const) {
      sky.setThermal({ magma: 0, desert: 0, rock: 0, tundra: 0, ice: 0, [key]: 1 })
      const { zenith, horizon } = sky.diagnostics()
      expect(lum(horizon), key).toBeGreaterThan(lum(zenith))
      // 更暖：地平线的红蓝比高于天顶。
      const warmth = (c: readonly number[]) => c[0]! / Math.max(1e-6, c[2]!)
      expect(warmth(horizon), key).toBeGreaterThan(warmth(zenith))
    }
  })

  it('writes finite sun lighting for degenerate input', () => {
    const { sky } = setup()
    const floats = vi.spyOn(sky.material, 'setFloat')
    for (const bad of [[0, 0, 0], [Number.NaN, 1, 0], [Infinity, Infinity, 0]] as const) sky.setSun(bad)
    sky.setDim(Number.NaN)
    for (const [, value] of floats.mock.calls) expect(Number.isFinite(value)).toBe(true)
    expect(Number.isFinite(sky.diagnostics().daylight)).toBe(true)
    expect(Number.isFinite(sky.diagnostics().sunDiscGain)).toBe(true)
  })
})
