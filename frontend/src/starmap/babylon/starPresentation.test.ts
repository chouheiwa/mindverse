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
      coronaIntensity: 0,
      systemReveal: 0,
      focusedOpacity: 1,
      nonFocusedTargetOpacity: 0.18,
      backgroundDimMix: 0,
      effectiveNonFocusedOpacity: 1,
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
    expect(describeStarPresentation({ phase: 'approach', approachProgress: 0 }))
      .toMatchObject({
        nonFocusedTargetOpacity: 0.18,
        backgroundDimMix: 0,
        effectiveNonFocusedOpacity: 1,
      })
    expect(halfway.coreAlpha).toBe(0.5)
    expect(halfway.surfaceAlpha).toBe(0.5)
    expect(halfway.systemReveal).toBe(0)
    expect(halfway).toMatchObject({
      nonFocusedTargetOpacity: 0.18,
      backgroundDimMix: 0.5,
      effectiveNonFocusedOpacity: 0.59,
      coronaIntensity: 1,
    })
    expect(arrival).toMatchObject({
      coreAlpha: 0, haloAlpha: 0, surfaceAlpha: 1, coronaAlpha: 1, systemReveal: 1,
      nonFocusedTargetOpacity: 0.18, backgroundDimMix: 1,
      effectiveNonFocusedOpacity: 0.18, lodIntent: 'surface',
    })
  })

  it('keeps focus hierarchy visually stable', () => {
    expect(describeStarPresentation({ phase: 'star-focus' })).toMatchObject({
      surfaceAlpha: 1,
      coronaAlpha: 1,
      focusedOpacity: 1,
      nonFocusedTargetOpacity: 0.18,
      backgroundDimMix: 1,
      effectiveNonFocusedOpacity: 0.18,
      systemReveal: 1,
      coronaIntensity: 1,
      lodIntent: 'surface',
    })
    expect(describeStarPresentation({ phase: 'planet-focus' })).toMatchObject({
      surfaceAlpha: 1,
      coronaAlpha: 0.45,
      focusedOpacity: 1,
      nonFocusedTargetOpacity: 0.18,
      backgroundDimMix: 1,
      effectiveNonFocusedOpacity: 0.18,
      systemReveal: 1,
      coronaIntensity: 0.55,
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
        nonFocusedTargetOpacity: 0,
        backgroundDimMix: 0,
        effectiveNonFocusedOpacity: 0,
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

  it('moves continuously and monotonically from hovered scale into pressed scale', () => {
    const scale = (pressedProgress: number) => describeStarPresentation({
      phase: 'panorama', hoverProgress: 1, pressedProgress,
    }).coreScale
    const samples = [scale(0), scale(Number.EPSILON), scale(0.25), scale(0.5), scale(1)]

    expect(samples[1]).toBeLessThanOrEqual(samples[0] as number)
    expect(samples).toEqual([...samples].sort((left, right) => right - left))
    expect(samples.at(-1)).toBe(0.94)
    expect(scale(Number.EPSILON)).toBeCloseTo(1.08, 14)
  })

  it('releases continuously back toward the hovered scale', () => {
    const almostReleased = describeStarPresentation({
      phase: 'panorama', hoverProgress: 1, pressedProgress: Number.EPSILON,
    }).coreScale
    const released = describeStarPresentation({
      phase: 'panorama', hoverProgress: 1, pressedProgress: 0,
    }).coreScale

    expect(almostReleased).toBeLessThanOrEqual(released)
    expect(almostReleased).toBeCloseTo(released, 14)
  })

  it('clamps progress and replaces nonfinite values', () => {
    const stable = describeStarPresentation({
      phase: 'approach', approachProgress: 2, hoverProgress: Number.NaN,
      pressedProgress: Number.POSITIVE_INFINITY,
    })

    expect(stable).toMatchObject({ systemReveal: 1, coreScale: 1 })
    expect(Object.values(stable).filter((value): value is number => typeof value === 'number'))
      .toSatisfy((values: number[]) => values.every(Number.isFinite))
    expect(Object.isFrozen(stable)).toBe(true)
  })
})
