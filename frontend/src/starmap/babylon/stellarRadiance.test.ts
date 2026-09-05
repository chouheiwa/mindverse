import { describe, expect, it } from 'vitest'
import { starColor, temperature } from '../gl/blackbody'
import { babylonCinematicEnvironment } from './cinematic'
import {
  STAR_FLARE_THRESHOLD,
  STAR_SURFACE_HDR_GAIN,
  STAR_SURFACE_RADIANCE_CEILING,
  flareGate,
  starPanoramaBrightness,
  radianceLuminance,
  starCoreRadiance,
  starSurfaceRadiance,
} from './stellarRadiance'
import { starSurfaceFragmentShader } from './shaders/starSurface.fragment.fx'
import { starCoreFragmentShader } from './shaders/starCore.fragment.fx'

// The fixture star: hue 218 / sat 70 → a 12288 K blue-white primary.
const COLOR = starColor(218, 70)
const KELVIN = temperature(218, 70)
const THRESHOLD = babylonCinematicEnvironment('high').bloomThreshold

const surface = (facing: number, granulation = 0.5, cellular = 0.5) => radianceLuminance(
  starSurfaceRadiance({ kelvin: KELVIN, color: COLOR, facing, granulation, cellular, activity: 0 }),
)

describe('focused star surface radiance', () => {
  it('clears the bloom threshold with real headroom at the disc centre', () => {
    // Three drove its core with GAIN.core = 4.6 so the composer had something
    // above 1.0 to bleed; the Babylon surface previously peaked near 1.0 while
    // the threshold sat at 1.05, so the star read as a matte rock.
    expect(surface(1)).toBeGreaterThan(THRESHOLD * 3)
  })

  it('keeps the limb above the threshold so the whole disc glows, not one dot', () => {
    expect(surface(0.15)).toBeGreaterThan(THRESHOLD)
    expect(surface(0)).toBeGreaterThan(THRESHOLD)
  })

  it('stays brightest at the centre and falls off monotonically towards the limb', () => {
    const samples = [1, 0.75, 0.5, 0.25, 0].map((facing) => surface(facing))
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index]!).toBeLessThan(samples[index - 1]!)
    }
  })

  it('bounds radiance so tone mapping cannot flood the frame to white', () => {
    const blazing = starSurfaceRadiance({
      kelvin: 40_000, color: [1, 1, 1], facing: 1, granulation: 1, cellular: 1, activity: 1,
    })
    for (const channel of blazing) expect(channel).toBeLessThanOrEqual(STAR_SURFACE_RADIANCE_CEILING)
    expect(STAR_SURFACE_RADIANCE_CEILING).toBeLessThan(8)
  })

  it('applies the shared HDR gain declared to the shader', () => {
    expect(STAR_SURFACE_HDR_GAIN).toBeGreaterThan(1)
    expect(starSurfaceFragmentShader).toContain('uniform float uHdrGain')
    expect(starSurfaceFragmentShader).toContain('uHdrGain')
    expect(starSurfaceFragmentShader).toContain(`vec3(${STAR_SURFACE_RADIANCE_CEILING.toFixed(1)})`)
  })
})

describe('panorama core radiance', () => {
  it('keeps a bright star core above the bloom threshold', () => {
    expect(radianceLuminance(starCoreRadiance(COLOR, 2.33, 0))).toBeGreaterThan(THRESHOLD)
    expect(starCoreFragmentShader).toContain('min(4.8')
  })

  it('leaves the faint outskirts of a sprite below the threshold', () => {
    // Otherwise every point sprite would smear and the panorama would grey out.
    expect(radianceLuminance(starCoreRadiance(COLOR, 2.33, 0.95))).toBeLessThan(THRESHOLD)
  })

  it('never lets a dim star reach bloom on its own', () => {
    expect(radianceLuminance(starCoreRadiance(COLOR, 0.72, 0.8))).toBeLessThan(THRESHOLD)
  })
})

describe('diffraction flare gating', () => {
  it('spikes only the most persistent stars, matching the Three threshold', () => {
    // Three gated on bright >= 0.85 where bright = 0.3 + 0.7 * persistence.
    expect(STAR_FLARE_THRESHOLD).toBeCloseTo(starPanoramaBrightness(0.85), 6)
    expect(flareGate(starPanoramaBrightness(0.9))).toBeGreaterThan(0)
    expect(flareGate(starPanoramaBrightness(0.8))).toBe(0)
    expect(flareGate(starPanoramaBrightness(0.3))).toBe(0)
  })

  it('leaves the ordinary field free of cheap crosses', () => {
    for (const persistence of [0, 0.2, 0.4, 0.6, 0.7]) {
      expect(flareGate(starPanoramaBrightness(0.3 + 0.7 * persistence))).toBe(0)
    }
    // Across an even spread of persistence only the top slice earns spikes.
    const sweep = Array.from({ length: 21 }, (_unused, step) => step / 20)
    const spiking = sweep.filter((persistence) => flareGate(starPanoramaBrightness(0.3 + 0.7 * persistence)) > 0)
    expect(spiking.length / sweep.length).toBeLessThan(0.25)
  })
})
