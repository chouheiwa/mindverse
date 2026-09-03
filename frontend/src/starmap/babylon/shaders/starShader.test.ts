import { describe, expect, it } from 'vitest'
import { starPanoramaVertexShader } from './starPanorama.vertex.fx'
import { starCoreFragmentShader } from './starCore.fragment.fx'
import { starHaloFragmentShader } from './starHalo.fragment.fx'
import { starFlareFragmentShader } from './starFlare.fragment.fx'
import { starSurfaceVertexShader } from './starSurface.vertex.fx'
import { starSurfaceFragmentShader } from './starSurface.fragment.fx'
import { starCoronaFragmentShader } from './starCorona.fragment.fx'

const all = [
  starPanoramaVertexShader, starCoreFragmentShader, starHaloFragmentShader,
  starFlareFragmentShader, starSurfaceVertexShader, starSurfaceFragmentShader,
  starCoronaFragmentShader,
]

describe('stellar shader contracts', () => {
  it('uses Babylon matrices and a complete shared panorama dataset', () => {
    for (const attribute of [
      'position', 'aCenter', 'aAxis', 'aColor', 'aPeriod', 'aCoreSize',
      'aHaloSize', 'aBright', 'aBurst', 'aSeed', 'aRot', 'aBodyR', 'aDim',
    ]) expect(starPanoramaVertexShader).toContain(`attribute ${attribute === 'position' || attribute === 'aCenter' || attribute === 'aAxis' || attribute === 'aColor' ? 'vec3' : 'float'} ${attribute}`)

    expect(starPanoramaVertexShader).toContain('uniform mat4 worldView')
    expect(starPanoramaVertexShader).toContain('uniform mat4 projection')
    expect(starPanoramaVertexShader).toContain('uniform float uRenderHeight')
    expect(starPanoramaVertexShader).toContain('uniform float uDevicePixelRatio')
    expect(starPanoramaVertexShader).toContain('uniform float uProjectionScale')
    expect(starPanoramaVertexShader).toContain('gl_PointSize')
    expect(starPanoramaVertexShader).toMatch(/6400\.0\s*\+\s*mod\(aSeed\s*\*\s*311\.0,\s*5200\.0\)/)
    expect(starPanoramaVertexShader).toContain('aDim')
    expect(starPanoramaVertexShader).toContain('attribute vec3 aInteraction')
  })

  it('renders radial hot cores, independent two-slope halos, and gated rotated flares', () => {
    expect(starCoreFragmentShader).toMatch(/if\s*\(d2\s*>\s*1\.0\)\s*discard/)
    expect(starCoreFragmentShader).toMatch(/mix\(vColor,\s*vec3\(1\.0\)/)
    expect(starCoreFragmentShader).toContain('min(')
    expect(starHaloFragmentShader).toContain('exp(')
    expect(starHaloFragmentShader).toContain('pow(')
    expect(starHaloFragmentShader).toContain('uHaloAlpha')
    expect(starFlareFragmentShader).toContain('uFlareThreshold')
    expect(starFlareFragmentShader).toMatch(/if\s*\(gate\s*<=/)
    expect(starFlareFragmentShader).toContain('vRot')
    expect(starFlareFragmentShader).toContain('secondary')
  })

  it('keeps the focused surface bounded, colored, detailed, and quality-controlled', () => {
    expect(starSurfaceFragmentShader).toMatch(/for\s*\(int\s+i\s*=\s*0;\s*i\s*<\s*4;/)
    expect(starSurfaceFragmentShader).toContain('#if STAR_NOISE_OCTAVES')
    expect(starSurfaceFragmentShader).toContain('uKelvin')
    expect(starSurfaceFragmentShader).toContain('uActivity')
    expect(starSurfaceFragmentShader).toContain('uColor')
    expect(starSurfaceFragmentShader).toContain('limb')
    expect(starSurfaceFragmentShader).toMatch(/max\([^;]+0\.0/)
    expect(starSurfaceVertexShader).toContain('worldViewProjection')
    expect(starSurfaceVertexShader).toContain('vLocal')
    expect(starSurfaceVertexShader).toContain('vViewDirection')
    expect(starSurfaceFragmentShader).toMatch(/dot\(normal,\s*normalize\(vViewDirection\)\)/)
  })

  it('lets corona alpha own the handoff without squaring it', () => {
    expect(starCoronaFragmentShader).toContain('uCoronaAlpha')
    expect(starCoronaFragmentShader).toContain('uCoronaIntensity')
    expect(starCoronaFragmentShader).toContain('smoothstep')
    expect(starCoronaFragmentShader).toContain('cutout')
    expect(starCoronaFragmentShader).not.toMatch(/uCoronaAlpha\s*\*\s*uCoronaAlpha/)
    expect(starCoronaFragmentShader).not.toMatch(/float alpha\s*=.*uCoronaIntensity/)
    expect(starCoronaFragmentShader).toMatch(/gl_FragColor\s*=\s*vec4\([^;]*uCoronaIntensity[^;]*,\s*alpha\)/)
  })

  it('contains no Three-only matrix identifiers', () => {
    for (const source of all) {
      expect(source).not.toContain('modelViewMatrix')
      expect(source).not.toContain('projectionMatrix')
    }
  })
})
