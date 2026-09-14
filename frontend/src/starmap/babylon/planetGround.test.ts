import { afterEach, describe, expect, it, vi } from 'vitest'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
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
  it('returns a Promise before starting compilation and resolves after compilation completes', async () => {
    const { ground } = setup()
    let finish!: () => void
    const compilation = new Promise<void>((resolve) => { finish = resolve })
    const compile = vi.spyOn(ground.material, 'forceCompilationAsync').mockReturnValue(compilation)
    const result = ground.warm()
    expect(result).toBeInstanceOf(Promise)
    expect(compile).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(compile).toHaveBeenCalledTimes(1)
    finish()
    await expect(result).resolves.toBe(true)
  })

  it('passes the optional mesh to the material compilation method once', async () => {
    const { ground, scene } = setup()
    const mesh = new Mesh('warm-ground', scene)
    const compile = vi.spyOn(ground.material, 'forceCompilationAsync').mockResolvedValue(undefined)
    await expect(ground.warm(mesh)).resolves.toBe(true)
    expect(compile).toHaveBeenCalledExactlyOnceWith(mesh)
    expect(compile.mock.contexts[0]).toBe(ground.material)
  })

  it.each([true, false])('falls back to readiness %s without a compilation method', async (ready) => {
    const { ground } = setup()
    Object.defineProperty(ground.material, 'forceCompilationAsync', { value: undefined, configurable: true })
    const readiness = vi.spyOn(ground.material, 'isReady').mockReturnValue(ready)
    await expect(ground.warm()).resolves.toBe(ready)
    expect(readiness).toHaveBeenCalledTimes(1)
  })

  it.each(['reject', 'throw'])('resolves false when compilation fails via %s', async (failure) => {
    const { ground } = setup()
    const compile = vi.spyOn(ground.material, 'forceCompilationAsync').mockImplementation(() => {
      if (failure === 'throw') throw new Error('shader compilation failed')
      return Promise.reject(new Error('shader compilation failed'))
    })
    await expect(ground.warm()).resolves.toBe(false)
    expect(compile).toHaveBeenCalledTimes(1)
  })

  it('does not access the material readiness or compile after disposal', async () => {
    const { ground } = setup()
    ground.dispose()
    const readiness = vi.spyOn(ground.material, 'isReady').mockImplementation(() => { throw new Error('disposed') })
    const compile = vi.spyOn(ground.material, 'forceCompilationAsync').mockImplementation(() => { throw new Error('disposed') })
    expect(ground.isReady()).toBe(false)
    await expect(ground.warm()).resolves.toBe(false)
    expect(ground.diagnostics().ready).toBe(false)
    expect(readiness).not.toHaveBeenCalled()
    expect(compile).not.toHaveBeenCalled()
  })

  it('skips deferred compilation if disposed before it starts', async () => {
    const { ground } = setup()
    const compile = vi.spyOn(ground.material, 'forceCompilationAsync').mockResolvedValue(undefined)
    const result = ground.warm()
    ground.dispose()
    await expect(result).resolves.toBe(false)
    expect(compile).not.toHaveBeenCalled()
  })

  it.each([true, false])('forwards readiness %s and includes it in diagnostics', (ready) => {
    const { ground } = setup()
    const readiness = vi.spyOn(ground.material, 'isReady').mockReturnValue(ready)
    expect(ground.isReady()).toBe(ready)
    expect(readiness).toHaveBeenCalledTimes(1)
    expect(ground.diagnostics().ready).toBe(ground.isReady())
  })

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

  it('culls two close-range noise octaves before sampling and fades their albedo contribution', () => {
    const source = planetGroundFragmentShader.replace(/\/\/[^\n]*/g, '')
    // 钉住距离淡出、分支内两次采样和最终乘法，避免只声明淡出却仍让远处铺满高频。
    expect(source).toContain('float detailFade = 1.0 - smoothstep(0.025, 0.16, relativeDistance)')
    const detailBlock = source.match(/if \(detailFade > 0\.0\)\s*\{([^}]+)\}/)?.[1] ?? ''
    expect(detailBlock.match(/valueNoise\(/g)).toHaveLength(2)
    expect(detailBlock).toContain('fineDetail * detailFade * uDetailStrength')
    expect(source).toContain('relativeDistance = eyeDistance / max(radius, 0.0001)')
    expect(source).toContain('albedo *= detailModulation')
  })

  it('uses sun-facing relief, bounded foot darkening and horizon-directed thermal haze', () => {
    const source = planetGroundFragmentShader
    expect(source).toContain('daylight * 1.6')
    expect(source).toContain('0.24 + skyLight * uHorizonColor * 0.35')
    expect(source).toContain('lit *= 1.0 - 0.12 * contactShade')
    expect(source).toContain('1.0 - smoothstep(0.006, 0.035, footprintDistance)')
    expect(source).toContain('1.0 - smoothstep(0.06, 0.4, abs(dot(viewDirection, cameraUp)))')
    expect(source).toContain('mix(1.0, 2.8, horizonView)')
    expect(source).toContain('uHorizonColor * vec3(1.08, 1.0, 0.92)')
  })

  it('passes ice and snow-line data to the ground instead of only a yellow thermal palette', () => {
    const { ground } = setup()
    const spy = vi.spyOn(ground.material, 'setFloat')
    ground.setThermal({ magma: 0, desert: 0, rock: 0, tundra: 0, ice: 1 })
    expect(spy).toHaveBeenCalledWith('uThermalIce', 1)
    expect(PLANET_GROUND_UNIFORMS).toContain('uSnowLine')
    expect(planetGroundFragmentShader).toContain('planetSnowCoverage(')
  })

  it('initializes the added detail uniform internally', () => {
    const floatSpy = vi.spyOn(ShaderMaterial.prototype, 'setFloat')
    try {
      setup()
      expect(floatSpy).toHaveBeenCalledWith('uDetailStrength', 0.42)
    } finally {
      floatSpy.mockRestore()
    }
  })

  it('keeps its shader numerically safe', () => {
    const fragment = planetGroundFragmentShader.replace(/\/\/[^\n]*/g, '')
    expect(`${planetGroundVertexShader}\n${fragment}`).not.toMatch(/\b(?:atan|acos|asin|normalize)\s*\(/)
    const calls = [...fragment.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g)]
    expect(calls).toHaveLength((fragment.match(/smoothstep\(/g) ?? []).length)
    for (const [, low, high] of calls) expect(Number(low)).toBeLessThan(Number(high))
    expect(fragment).toContain('vec4(clamp(color, 0.0, 1.0), 1.0)')
    // WebGL2 走 GLSL ES 3.00：`sample` 是保留字，内置函数名（distance/length/…）不能拿来当变量。
    // 实测用了就是 "Error compiling effect"，整块地表在真机上一片黑，而 NullEngine 测不出来。
    const source = `${planetGroundVertexShader}\n${fragment}`
    for (const reserved of ['sample', 'distance', 'length', 'mix', 'step', 'fract', 'floor', 'normal', 'smoothstep', 'clamp', 'dot', 'abs', 'max', 'min', 'texture', 'input', 'output']) {
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

  it.each([0, Number.NaN])('writes finite uniforms for degenerate input with radius %s', (radius) => {
    const { ground } = setup()
    const vectorSpy = vi.spyOn(ground.material, 'setVector3')
    const floatSpy = vi.spyOn(ground.material, 'setFloat')
    ground.setSun([0, 0, 0])
    ground.setSun([Number.NaN, Infinity, 0])
    ground.setCamera([Number.NaN, 0, 0], [Number.NaN, Infinity, 0], radius)
    ground.setThermal({ magma: Number.NaN, desert: Infinity, rock: -1, tundra: 0, ice: 0 })
    for (const [, vector] of vectorSpy.mock.calls) expect([vector.x, vector.y, vector.z].every(Number.isFinite)).toBe(true)
    for (const [, value] of floatSpy.mock.calls) expect(Number.isFinite(value)).toBe(true)
  })
})
