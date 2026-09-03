import { describe, expect, it } from 'vitest'
import {
  HOVER_INTERPOLATION_MS,
  describeStarPresentation,
} from './starPresentation'

describe('describeStarPresentation', () => {
  it('describes panorama point rendering without revealing the system', () => {
    expect(describeStarPresentation({ phase: 'panorama' })).toMatchObject({
      coreAlpha: 1,
      haloAlpha: 1,
      surfaceAlpha: 0,
      coronaAlpha: 0,
      systemReveal: 0,
      focusedOpacity: 1,
      nonFocusedOpacity: 1,
      lodIntent: 'point',
    })
  })

  it('uses one smooth handoff for approach and reveals the system only in its latter half', () => {
    const quarter = describeStarPresentation({ phase: 'approach', approachProgress: 0.25 })
    const halfway = describeStarPresentation({ phase: 'approach', approachProgress: 0.5 })
    const arrival = describeStarPresentation({ phase: 'approach', approachProgress: 1 })

    expect(quarter.coreAlpha + quarter.surfaceAlpha).toBe(1)
    expect(quarter.haloAlpha + quarter.coronaAlpha).toBe(1)
    expect(quarter.systemReveal).toBe(0)
    expect(describeStarPresentation({ phase: 'approach', approachProgress: 0 }).nonFocusedOpacity)
      .toBe(0.18)
    expect(halfway.coreAlpha).toBe(0.5)
    expect(halfway.surfaceAlpha).toBe(0.5)
    expect(halfway.systemReveal).toBe(0)
    expect(halfway.nonFocusedOpacity).toBe(0.18)
    expect(arrival).toMatchObject({
      coreAlpha: 0, haloAlpha: 0, surfaceAlpha: 1, coronaAlpha: 1, systemReveal: 1,
      nonFocusedOpacity: 0.18, lodIntent: 'surface',
    })
  })

  it('keeps focus hierarchy visually stable', () => {
    expect(describeStarPresentation({ phase: 'star-focus' })).toMatchObject({
      surfaceAlpha: 1,
      coronaAlpha: 1,
      focusedOpacity: 1,
      nonFocusedOpacity: 0.18,
      systemReveal: 1,
      lodIntent: 'surface',
    })
    expect(describeStarPresentation({ phase: 'planet-focus' })).toMatchObject({
      surfaceAlpha: 1,
      coronaAlpha: 0.45,
      focusedOpacity: 1,
      nonFocusedOpacity: 0.18,
      systemReveal: 1,
      lodIntent: 'surface',
    })
    expect(describeStarPresentation({ phase: 'planet-focus' }).coronaIntensity)
      .toBeLessThan(describeStarPresentation({ phase: 'star-focus' }).coronaIntensity)
  })

  it('zeros every stellar visual in strata', () => {
    expect(describeStarPresentation({ phase: 'strata', hoverProgress: 1, pressedProgress: 1 }))
      .toEqual({
        coreAlpha: 0,
        haloAlpha: 0,
        surfaceAlpha: 0,
        coronaAlpha: 0,
        coreScale: 0,
        coreBrightness: 0,
        haloIntensity: 0,
        coronaIntensity: 0,
        systemReveal: 0,
        focusedOpacity: 0,
        nonFocusedOpacity: 0,
        lodIntent: 'hidden',
      })
  })

  it('exposes the exact hover duration and interaction targets', () => {
    expect(HOVER_INTERPOLATION_MS).toBe(150)
    expect(describeStarPresentation({ phase: 'panorama', hoverProgress: 1 })).toMatchObject({
      coreScale: 1.08,
      coreBrightness: 1,
      haloIntensity: 1.25,
    })
    expect(describeStarPresentation({ phase: 'panorama', pressedProgress: 1 })).toMatchObject({
      coreScale: 0.94,
      coreBrightness: 1.12,
      haloIntensity: 1,
    })
  })

  it('lets pressed scale win while hover halo and pressed brightness combine deterministically', () => {
    expect(describeStarPresentation({
      phase: 'panorama', hoverProgress: 1, pressedProgress: 1,
    })).toMatchObject({
      coreScale: 0.94,
      coreBrightness: 1.12,
      haloIntensity: 1.25,
    })
  })

  it('clamps progress, replaces nonfinite values, and ignores Reduced Motion for stable output', () => {
    const stable = describeStarPresentation({
      phase: 'approach', approachProgress: 2, hoverProgress: Number.NaN,
      pressedProgress: Number.POSITIVE_INFINITY,
    })
    const reduced = describeStarPresentation({
      phase: 'approach', approachProgress: 2, hoverProgress: Number.NaN,
      pressedProgress: Number.POSITIVE_INFINITY, reducedMotion: true,
    })

    expect(reduced).toEqual(stable)
    expect(stable).toMatchObject({ systemReveal: 1, coreScale: 1 })
    expect(Object.values(stable).filter((value): value is number => typeof value === 'number'))
      .toSatisfy((values: number[]) => values.every(Number.isFinite))
    expect(Object.isFrozen(stable)).toBe(true)
  })
})
