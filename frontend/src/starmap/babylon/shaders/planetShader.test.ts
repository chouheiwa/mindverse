import { describe, expect, test } from 'vitest'
import { planetFragmentShader } from './planet.fragment.fx'
import { planetVertexShader } from './planet.vertex.fx'

describe('Babylon procedural planet shader contract', () => {
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

  test('contains thermal blending, terrain relief and evidence-safe overlays', () => {
    expect(planetFragmentShader).toMatch(/uniform\s+vec4\s+uThermal\s*;/)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uThermalIce\s*;/)
    expect(planetFragmentShader).toMatch(/magma.*desert.*rock.*tundra.*ice/s)
    expect(planetFragmentShader).toMatch(/crater/i)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uCraterDensity\s*;/)
    expect(planetFragmentShader).toMatch(/ridge/i)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uCreated\s*;/)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uCollected\s*;/)
    expect(planetFragmentShader).toMatch(/uniform\s+float\s+uSelected\s*;/)
    expect(planetFragmentShader).toMatch(/scan/i)
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
