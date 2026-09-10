import { afterEach, describe, expect, it, vi } from 'vitest'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { PlanetGround, PLANET_GROUND_UNIFORMS } from './planetGround'
import { planetGroundVertexShader } from './shaders/planetGround.vertex.fx'
import { planetGroundFragmentShader } from './shaders/planetGround.fragment.fx'

const cleanup: (() => void)[] = []
afterEach(() => { cleanup.splice(0).forEach((dispose) => dispose()) })
function setup() {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const ground = new PlanetGround(scene, { radius: 0.18, thermal: { magma: 0, desert: 0, rock: 1, tundra: 0, ice: 0 } })
  cleanup.push(() => { ground.dispose(); scene.dispose(); engine.dispose() })
  return { scene, ground }
}

describe('PlanetGround', () => {
  // 素色 StandardMaterial 在近地视角下只是一片平灰。地表要有细节：噪声岩理、坡向
  // 露岩、朝向太阳的明暗、远处融进地平线的雾 —— 这些都是着色器的事，几何仍在 CPU。
  it('declares the exact uniform contract in its shaders', () => {
    const source = `${planetGroundVertexShader}\n${planetGroundFragmentShader}`.replace(/\/\/[^\n]*/g, '')
    const declarations = [...source.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map((match) => match[1])
    expect(declarations.sort()).toEqual([...PLANET_GROUND_UNIFORMS].sort())
    const { ground } = setup()
    expect(ground.material.options.uniforms).toEqual([...PLANET_GROUND_UNIFORMS])
    expect(ground.material.backFaceCulling).toBe(true)
  })

  it('keeps its shader numerically safe', () => {
    const fragment = planetGroundFragmentShader.replace(/\/\/[^\n]*/g, '')
    expect(fragment).not.toMatch(/\b(?:atan|acos|asin|normalize)\s*\(/)
    const calls = [...fragment.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g)]
    expect(calls).toHaveLength((fragment.match(/smoothstep\(/g) ?? []).length)
    for (const [, low, high] of calls) expect(Number(low)).toBeLessThan(Number(high))
    expect(fragment).toContain('vec4(clamp(color, 0.0, 1.0), 1.0)')
    // WebGL2 走 GLSL ES 3.00：`sample` 是保留字，内置函数名（distance/length/…）不能拿来当变量。
    // 实测用了就是 "Error compiling effect"，整块地表在真机上一片黑，而 NullEngine 测不出来。
    const source = `${planetGroundVertexShader}\n${fragment}`
    for (const reserved of ['sample', 'distance', 'length', 'mix', 'step', 'fract', 'floor', 'normal']) {
      expect(source, reserved).not.toMatch(new RegExp(`\\b(?:float|vec[234]|int)\\s+${reserved}\\s*=`))
    }
  })

  it('derives three ground tones from the thermal palette: base, a lighter accent, a darker rock', () => {
    const { ground } = setup()
    const { base, accent, rock } = ground.diagnostics()
    const lum = (c: readonly number[]) => c[0]! * 0.2126 + c[1]! * 0.7152 + c[2]! * 0.0722
    expect(lum(accent)).toBeGreaterThan(lum(base))
    expect(lum(rock)).toBeLessThan(lum(base))
    ground.setThermal({ magma: 1, desert: 0, rock: 0, tundra: 0, ice: 0 })
    const magma = ground.diagnostics()
    expect(magma.base[0]).toBeGreaterThan(magma.base[2]!)
  })

  it('writes finite uniforms for degenerate sun, camera and thermal input', () => {
    const { ground } = setup()
    const vectorSpy = vi.spyOn(ground.material, 'setVector3')
    const floatSpy = vi.spyOn(ground.material, 'setFloat')
    ground.setSun([0, 0, 0])
    ground.setSun([Number.NaN, Infinity, 0])
    ground.setCamera([Number.NaN, 0, 0], [0, 0, 0], Number.NaN)
    ground.setThermal({ magma: Number.NaN, desert: Infinity, rock: -1, tundra: 0, ice: 0 })
    for (const [, vector] of vectorSpy.mock.calls) expect([vector.x, vector.y, vector.z].every(Number.isFinite)).toBe(true)
    for (const [, value] of floatSpy.mock.calls) expect(Number.isFinite(value)).toBe(true)
  })
})
