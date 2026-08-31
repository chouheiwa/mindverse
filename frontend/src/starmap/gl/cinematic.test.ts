import { describe, expect, test } from 'vitest'
import { cinematicEnvironment } from './cinematic'

describe('cinematicEnvironment', () => {
  test.each([
    ['high', { nebulaBake: 512, shellGain: [0.10, 0.075, 0.035], coreGain: 0.38, bloom: 0.72, chromaticAberration: 0 }],
    ['medium', { nebulaBake: 256, shellGain: [0.085, 0.055, 0.025], coreGain: 0.30, bloom: 0.62, chromaticAberration: 0 }],
    ['low', { nebulaBake: 128, shellGain: [0.06, 0.035, 0.015], coreGain: 0.22, bloom: 0.48, chromaticAberration: 0 }],
  ] as const)('returns the exact %s environment', (quality, expected) => {
    expect(cinematicEnvironment(quality)).toEqual(expected)
  })

  test('keeps the high shell stack below the quiet-background ceiling', () => {
    expect(cinematicEnvironment('high').shellGain.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(0.24)
  })
})
