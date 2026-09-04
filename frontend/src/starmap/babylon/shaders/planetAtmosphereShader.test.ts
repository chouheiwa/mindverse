import { describe, expect, test } from 'vitest'
import { planetAtmosphereFragmentShader } from './planetAtmosphere.fragment.fx'
import { planetAtmosphereVertexShader } from './planetAtmosphere.vertex.fx'

function expectNoReversedNumericSmoothstep(source: string): void {
  const calls = [...source.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g)]
  expect(calls.filter(([, low, high]) => Number(low) > Number(high))).toEqual([])
}

describe('Babylon planet atmosphere shader contract', () => {
  test('passes world-space shell geometry to the scattering stage', () => {
    expect(planetAtmosphereVertexShader).toMatch(/attribute\s+vec3\s+position\s*;/)
    expect(planetAtmosphereVertexShader).toMatch(/attribute\s+vec3\s+normal\s*;/)
    expect(planetAtmosphereVertexShader).toContain('worldViewProjection')
    expect(planetAtmosphereVertexShader).toContain('vWorldPosition')
    expect(planetAtmosphereVertexShader).toContain('vWorldNormal')
  })

  test('computes bounded sun-facing atmospheric scattering without raymarching', () => {
    expect(planetAtmosphereFragmentShader).toContain('raySpherePath')
    expect(planetAtmosphereFragmentShader).toContain('rayleighPhase')
    expect(planetAtmosphereFragmentShader).toContain('miePhase')
    expect(planetAtmosphereFragmentShader).toContain('uLightDirection')
    expect(planetAtmosphereFragmentShader).toContain('uCameraPosition')
    expect(planetAtmosphereFragmentShader).toContain('uDensity')
    expect(planetAtmosphereFragmentShader).toContain('uQualityLevel')
    expect(planetAtmosphereFragmentShader).toMatch(/nightShadow/)
    expect(planetAtmosphereFragmentShader).toMatch(/uQualityLevel\s*==\s*0/)
    expect(planetAtmosphereFragmentShader).not.toContain('for (')
    expect(planetAtmosphereFragmentShader).not.toMatch(/cloud/i)
    expectNoReversedNumericSmoothstep(planetAtmosphereFragmentShader)
  })

  test('bounds shell opacity by density, path length, and reveal', () => {
    expect(planetAtmosphereFragmentShader).toMatch(/alpha[\s\S]*uDensity/)
    expect(planetAtmosphereFragmentShader).toMatch(/alpha[\s\S]*pathLength/)
    expect(planetAtmosphereFragmentShader).toMatch(/alpha[\s\S]*uReveal/)
    expect(planetAtmosphereFragmentShader).toMatch(/clamp\(alpha/)
  })
})
