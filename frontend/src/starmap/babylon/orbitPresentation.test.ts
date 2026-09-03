import { describe, expect, test, vi } from 'vitest'
import {
  macroOrbitAlpha,
  applyOrbitLineAlpha,
  questionOrbitAlpha,
  questionPlanetPresentation,
  questionPlanetVisible,
  selectDominantClusterIds,
  selectMacroOrbitRadius,
} from './orbitPresentation'

describe('Babylon orbit presentation states', () => {
  test('fully disables a hidden line instead of trusting transparent RGB writes', () => {
    const line = { alpha: 1, setEnabled: vi.fn() }
    applyOrbitLineAlpha(line, 0)
    expect(line.alpha).toBe(0)
    expect(line.setEnabled).toHaveBeenCalledWith(false)

    applyOrbitLineAlpha(line, 0.34)
    expect(line.alpha).toBe(0.34)
    expect(line.setEnabled).toHaveBeenLastCalledWith(true)
  })

  test('reduces a cluster to one representative macro orbit', () => {
    expect(selectMacroOrbitRadius([0.4, 2.1, 2.8, 7.2, 12.4])).toBe(7)
    expect(selectMacroOrbitRadius([0.2, 1.4])).toBeNull()
  })

  test('limits panorama structure to the clusters carrying the most content', () => {
    expect(selectDominantClusterIds([
      { g: 1, n: 3 }, { g: 2, n: 19 }, { g: 3, n: 8 }, { g: 4, n: 11 },
    ], 2)).toEqual(new Set([2, 4]))
  })

  test('panorama keeps only the faint macro knowledge structure', () => {
    expect(macroOrbitAlpha({ phase: 'panorama', ownerKey: '1' })).toBeGreaterThan(0)
    expect(questionOrbitAlpha({ phase: 'panorama', ownerKey: 'star:a' })).toBe(0)
    expect(questionPlanetVisible({ phase: 'panorama', ownerKey: 'star:a' })).toBe(false)
  })

  test('star focus unfolds every question orbit in that system only', () => {
    const state = { phase: 'star-focus' as const, focusedOwnerKey: 'star:a' }
    expect(questionOrbitAlpha({ ...state, ownerKey: 'star:a' })).toBeGreaterThan(0)
    expect(questionOrbitAlpha({ ...state, ownerKey: 'star:b' })).toBe(0)
    expect(questionPlanetVisible({ ...state, ownerKey: 'star:a' })).toBe(true)
    expect(questionPlanetVisible({ ...state, ownerKey: 'star:b' })).toBe(false)
  })

  test.each([[0, 0], [0.5, 0.17], [1, 0.34], [Number.NaN, 0]])(
    'reveals question paths continuously at system reveal %s',
    (systemReveal, expected) => {
      const state = { phase: 'approach' as const, focusedOwnerKey: 'star:a', systemReveal }
      expect(questionOrbitAlpha({ ...state, ownerKey: 'star:a' })).toBeCloseTo(expected)
    },
  )

  test('keeps barely revealed planets unpickable and enables them after the threshold', () => {
    expect(questionPlanetPresentation({
      phase: 'approach', focusedOwnerKey: 'star:a', ownerKey: 'star:a', systemReveal: 0.04,
    })).toEqual({ reveal: 0.04, visible: true, pickable: false })
    expect(questionPlanetPresentation({
      phase: 'approach', focusedOwnerKey: 'star:a', ownerKey: 'star:a', systemReveal: 0.06,
    })).toEqual({ reveal: 0.06, visible: true, pickable: true })
  })

  test('planet focus emphasizes its path and leaves sibling paths as context', () => {
    const state = {
      phase: 'planet-focus' as const,
      focusedOwnerKey: 'star:a',
      selectedQuestionId: 'question:2',
    }
    expect(questionOrbitAlpha({ ...state, ownerKey: 'star:a', questionId: 'question:2' }))
      .toBeGreaterThan(questionOrbitAlpha({ ...state, ownerKey: 'star:a', questionId: 'question:1' }))
    expect(questionOrbitAlpha({ ...state, ownerKey: 'star:b', questionId: 'question:3' })).toBe(0)
  })

  test('strata removes every spatial orbit and planet', () => {
    const state = { phase: 'strata' as const, focusedOwnerKey: 'star:a', selectedQuestionId: 'question:1' }
    expect(macroOrbitAlpha({ ...state, ownerKey: '1' })).toBe(0)
    expect(questionOrbitAlpha({ ...state, ownerKey: 'star:a', questionId: 'question:1' })).toBe(0)
    expect(questionPlanetVisible({ ...state, ownerKey: 'star:a' })).toBe(false)
  })
})
