import { describe, expect, it } from 'vitest'
import { PLANET_SKY_UNIFORMS } from '../planetSky'
import { planetSkyVertexShader } from './planetSky.vertex.fx'
import { planetSkyFragmentShader } from './planetSky.fragment.fx'

const fragment = planetSkyFragmentShader.replace(/\/\/[^\n]*/g, '')
describe('Planet sky shader numerical contract', () => {
  it('declares the exact material uniform contract', () => {
    const declarations = [...`${planetSkyVertexShader}\n${fragment}`.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map(match => match[1])
    expect(declarations.sort()).toEqual([...PLANET_SKY_UNIFORMS].sort())
  })

  it('requires strictly increasing edges for every smoothstep', () => {
    // 日面的边是 uniform（角半径的余弦由 TS 算好传进来），内置 smoothstep 的边只能是
    // 字面量，所以那一处改成了手写的 t*t*(3-2t)。规则不变：只要用了内置 smoothstep，
    // 两个边就必须是严格递增的字面量 —— 变量边会让匹配数对不上而红。
    const total = (fragment.match(/smoothstep\(/g) ?? []).length
    const calls = [...fragment.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g)]
    expect(calls).toHaveLength(total)
    for (const [, low, high] of calls) expect(Number(low)).toBeLessThan(Number(high))
    // 手写的那处必须有保护过的分母。
    expect(fragment).toContain('max(uSunDiscCos - uSunHaloCos, 0.0001)')
  })

  it('guards all divisions and avoids undefined angular or zero normalization operations', () => {
    expect(fragment).not.toMatch(/\b(?:atan|acos|asin|normalize)\s*\(/)
    // 每一处除法的分母都必须裹在 max() 里。原来这条是「恰好两处除法」的计数断言 ——
    // 加一处带保护的除法就会红，钉的是数量而不是意图。
    const divisions = [...fragment.matchAll(/\/\s*([A-Za-z_]+)\s*\(/g)]
    expect(divisions.length).toBeGreaterThanOrEqual(2)
    for (const [, callee] of divisions) expect(callee).toBe('max')
    expect(fragment).toContain('value / max(length(value), 0.0001)')
    expect(fragment).toContain('0.36 / max(pow(mieBase, 1.5), 0.008)')
    expect(fragment).toContain('max(1.64 - 1.6 * mu, 0.04)')
    expect(fragment).toContain('clamp(dot(ray, sun), -1.0, 1.0)')
  })

  it('bounds alpha and outgoing color', () => {
    expect(fragment).toContain('float alpha = clamp(uDim, 0.0, 1.0)')
    expect(fragment).toContain('vec4(clamp(color, 0.0, 1.0), alpha)')
  })
})
