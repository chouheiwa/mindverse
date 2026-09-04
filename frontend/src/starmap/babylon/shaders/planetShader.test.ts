import { describe, expect, test } from 'vitest'
import { planetFragmentShader } from './planet.fragment.fx'
import { planetVertexShader } from './planet.vertex.fx'

function expectNoReversedNumericSmoothstep(source: string): void {
  const calls = [...source.matchAll(/smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g)]
  expect(calls.filter(([, low, high]) => Number(low) > Number(high))).toEqual([])
}

describe('Babylon procedural planet shader contract', () => {
  test('supports continuous reveal without making geometry pop', () => {
    expect(planetFragmentShader).toContain('uniform float uReveal')
    expect(planetFragmentShader).toMatch(/gl_FragColor\s*=\s*vec4\([^;]+uReveal/)
  })

  test('declares Babylon attributes and a real near-surface displacement path', () => {
    expect(planetVertexShader).toMatch(/attribute\s+vec3\s+position\s*;/)
    expect(planetVertexShader).toMatch(/attribute\s+vec3\s+normal\s*;/)
    expect(planetVertexShader).toMatch(/uniform\s+mat4\s+worldViewProjection\s*;/)
    expect(planetVertexShader).toMatch(/uniform\s+float\s+uDisplacement\s*;/)
    expect(planetVertexShader).toMatch(/uniform\s+float\s+uSeed\s*;/)
    expect(planetVertexShader).not.toMatch(/terrainNoise\([^)]*uTime/)
    expect(planetVertexShader).toMatch(/position\s*\+\s*normal\s*\*.*uDisplacement/s)
    expect(planetVertexShader).toMatch(/varying\s+vec3\s+vLocal/)
  })

  test('uses coherent warped 3D terrain and tangent finite-difference normals', () => {
    expect(planetVertexShader).toContain('gradientNoise')
    expect(planetVertexShader).toContain('fbm')
    expect(planetVertexShader).toContain('domainWarp')
    expect(planetVertexShader).toContain('ridgedNoise')
    expect(planetVertexShader).toContain('craterProfile')
    expect(planetVertexShader).toContain('displacedNormal')
    expect(planetVertexShader).toMatch(/uLargeCraters\s*\[\s*8\s*\]/)
    expect(planetVertexShader).toMatch(/for\s*\(\s*int\s+[xyz]\s*=\s*-1;[\s\S]*<=\s*1;[\s\S]*\)/)
    expect(planetVertexShader).toContain('uSmallCraterThreshold')
    expect(planetVertexShader).toContain('uDetailDensity')
    expect(planetVertexShader).not.toMatch(/hash31\s*\(\s*floor/)
    expect(planetFragmentShader).not.toMatch(/hash31\s*\(\s*floor/)
    expect(planetVertexShader).not.toMatch(/\buv\b/i)
    expectNoReversedNumericSmoothstep(planetVertexShader)
  })

  test('contains thermal blending, terrain relief and evidence-safe overlays', () => {
    expect(planetFragmentShader).toMatch(/uniform\s+vec4\s+uThermal\s*;/)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uThermalIce\s*;/)
    expect(planetFragmentShader).toMatch(/magma.*desert.*rock.*tundra.*ice/s)
    expect(planetFragmentShader).toMatch(/crater/i)
    expect(planetFragmentShader).toMatch(/microTone\s*=\s*clamp\(1\.0\s*\+\s*vRelief\s*\*\s*0\.16/)
    expect(planetFragmentShader).toContain('materialNoise')
    expect(planetFragmentShader).toContain('duneStrata')
    expect(planetFragmentShader).toContain('rockMottle')
    expect(planetFragmentShader).toMatch(/uThermal\.z\s*\*\s*rockDarkMask\s*\*\s*0\.62/)
    expect(planetFragmentShader).toContain('tundraPatches')
    expect(planetFragmentShader).toMatch(/uThermal\.w\s*\*\s*tundraDarkMask\s*\*\s*0\.58/)
    expect(planetFragmentShader).toContain('iceFractures')
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uCraterDensity\s*;/)
    expect(planetFragmentShader).toMatch(/ridge/i)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uCreated\s*;/)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uCollected\s*;/)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uSelected\s*;/)
    expect(planetFragmentShader).not.toMatch(/scanPosition|scanFeedback/)
    expect(planetFragmentShader).toMatch(/selectionRim[\s\S]*uSelected\s*\*\s*0\.02/)
  })

  test('lights spatial material zones with view-dependent dielectric GGX and bounded emissive', () => {
    expect(planetFragmentShader).toContain('uLightDirection')
    expect(planetFragmentShader).toContain('uCameraPosition')
    expect(planetFragmentShader).toContain('distributionGGX')
    expect(planetFragmentShader).toContain('geometrySmith')
    expect(planetFragmentShader).toContain('fresnelSchlick')
    expect(planetFragmentShader).toContain('emissive')
    expect(planetFragmentShader).toContain('latitude')
    expect(planetFragmentShader).toContain('polarMask')
    expect(planetFragmentShader).toContain('highlandMask')
    expect(planetFragmentShader).toContain('basinMask')
    expect(planetFragmentShader).toContain('uIncident')
    expect(planetVertexShader).toMatch(/varying\s+vec3\s+vWorldRadial\s*;/)
    expect(planetFragmentShader).toMatch(/mix\(vWorldRadial,\s*vNormal,\s*0\.18\)/)
    expect(planetFragmentShader).toMatch(/const\s+vec3\s+DIELECTRIC_F0\s*=\s*vec3\(0\.04\)/)
    expect(planetFragmentShader).not.toContain('vec3(-0.6, 0.45, -0.72)')
    expectNoReversedNumericSmoothstep(planetFragmentShader)
  })

  test('uses portable varyings and no Three-specific shader built-ins', () => {
    for (const source of [planetVertexShader, planetFragmentShader]) {
      expect(source).not.toMatch(/modelMatrix|projectionMatrix|cameraPosition|uvTransform/)
      expect(source).not.toMatch(/#include\s+<three/)
    }
    expect(planetFragmentShader).toMatch(/precision\s+highp\s+float/)
    expect(planetFragmentShader).toMatch(/gl_FragColor/)
  })
})
