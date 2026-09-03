export const HOVER_INTERPOLATION_MS = 150

export type StarPresentationPhase =
  | 'panorama'
  | 'approach'
  | 'star-focus'
  | 'planet-focus'
  | 'strata'

export type StarLodIntent = 'point' | 'transition' | 'surface' | 'hidden'

export interface StarPresentationInput {
  readonly phase: StarPresentationPhase
  readonly approachProgress?: number
  readonly hoverProgress?: number
  readonly pressedProgress?: number
  readonly reducedMotion?: boolean
}

export interface StarPresentation {
  readonly coreAlpha: number
  readonly haloAlpha: number
  readonly surfaceAlpha: number
  readonly coronaAlpha: number
  readonly coreScale: number
  readonly coreBrightness: number
  readonly haloIntensity: number
  readonly coronaIntensity: number
  readonly systemReveal: number
  readonly focusedOpacity: number
  readonly nonFocusedOpacity: number
  readonly lodIntent: StarLodIntent
}

function unit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value as number))
}

function smoothstep(value: number): number {
  return value * value * (3 - 2 * value)
}

function basePresentation(
  input: StarPresentationInput,
): Omit<StarPresentation, 'coreScale' | 'coreBrightness' | 'haloIntensity'> {
  if (input.phase === 'strata') {
    return {
      coreAlpha: 0, haloAlpha: 0, surfaceAlpha: 0, coronaAlpha: 0,
      coronaIntensity: 0, systemReveal: 0, focusedOpacity: 0, nonFocusedOpacity: 0,
      lodIntent: 'hidden',
    }
  }

  if (input.phase === 'approach') {
    const progress = unit(input.approachProgress)
    const handoff = smoothstep(progress)
    const systemReveal = smoothstep(unit((progress - 0.5) * 2))
    return {
      coreAlpha: 1 - handoff,
      haloAlpha: 1 - handoff,
      surfaceAlpha: handoff,
      coronaAlpha: handoff,
      coronaIntensity: handoff,
      systemReveal,
      focusedOpacity: 1,
      nonFocusedOpacity: 0.18,
      lodIntent: progress === 0 ? 'point' : progress === 1 ? 'surface' : 'transition',
    }
  }

  if (input.phase === 'star-focus' || input.phase === 'planet-focus') {
    const planetFocus = input.phase === 'planet-focus'
    return {
      coreAlpha: 0,
      haloAlpha: 0,
      surfaceAlpha: 1,
      coronaAlpha: planetFocus ? 0.45 : 1,
      coronaIntensity: planetFocus ? 0.55 : 1,
      systemReveal: 1,
      focusedOpacity: 1,
      nonFocusedOpacity: 0.18,
      lodIntent: 'surface',
    }
  }

  return {
    coreAlpha: 1, haloAlpha: 1, surfaceAlpha: 0, coronaAlpha: 0,
    coronaIntensity: 0, systemReveal: 0, focusedOpacity: 1, nonFocusedOpacity: 1,
    lodIntent: 'point',
  }
}

export function describeStarPresentation(input: StarPresentationInput): StarPresentation {
  const base = basePresentation(input)
  if (input.phase === 'strata') {
    return Object.freeze({ ...base, coreScale: 0, coreBrightness: 0, haloIntensity: 0 })
  }

  const hover = unit(input.hoverProgress)
  const pressed = unit(input.pressedProgress)
  const coreScale = pressed > 0
    ? 1 + (0.94 - 1) * pressed
    : 1 + (1.08 - 1) * hover

  return Object.freeze({
    ...base,
    coreScale,
    coreBrightness: 1 + (1.12 - 1) * pressed,
    haloIntensity: 1 + (1.25 - 1) * hover,
  })
}
