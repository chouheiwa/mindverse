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
    const calls = [...fragment.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g)]
    expect(calls.length).toBeGreaterThan(0)
    expect(calls).toHaveLength((fragment.match(/smoothstep\(/g) ?? []).length)
    for (const [, low, high] of calls) expect(Number(low)).toBeLessThan(Number(high))
  })

  it('guards all divisions and avoids undefined angular or zero normalization operations', () => {
    expect(fragment).not.toMatch(/\b(?:atan|acos|asin|normalize)\s*\(/)
    expect((fragment.match(/\//g) ?? []).length).toBe(2)
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
