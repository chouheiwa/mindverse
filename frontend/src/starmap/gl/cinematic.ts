import type { Quality } from '../quality'

export interface CinematicEnvironment {
  nebulaBake: number
  shellGain: readonly [number, number, number]
  coreGain: number
  bloom: number
  chromaticAberration: number
  multisampling: number
  bloomLevels: number
  probeMotionSampleMs: number
}

const ENVIRONMENTS: Record<Quality, CinematicEnvironment> = {
  high: { nebulaBake: 512, shellGain: [0.10, 0.075, 0.035], coreGain: 0.38, bloom: 0.72, chromaticAberration: 0, multisampling: 4, bloomLevels: 8, probeMotionSampleMs: 0 },
  medium: { nebulaBake: 256, shellGain: [0.085, 0.055, 0.025], coreGain: 0.30, bloom: 0.62, chromaticAberration: 0, multisampling: 0, bloomLevels: 5, probeMotionSampleMs: 50 },
  low: { nebulaBake: 128, shellGain: [0.06, 0.035, 0.015], coreGain: 0.22, bloom: 0.48, chromaticAberration: 0, multisampling: 0, bloomLevels: 4, probeMotionSampleMs: 100 },
}

export function cinematicEnvironment(quality: Quality): CinematicEnvironment {
  return ENVIRONMENTS[quality]
}
