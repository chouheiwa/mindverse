import { describe, expect, test, vi } from 'vitest'
import {
  macroOrbitAlpha,
  applyOrbitLineAlpha,
  questionOrbitAlpha,
  questionPlanetPresentation,
  questionPlanetVisible,
  selectDominantClusterIds,
  selectMacroOrbitRadius,
  StellarPointerPresentationController,
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

  test('asteroid-belt bodies never get their own orbit ring', () => {
    // 五十个同心环就是「特别难看」：带里的天体只画天体，不画环。
    const state = { phase: 'star-focus' as const, focusedOwnerKey: 'star:a', ownerKey: 'star:a' }
    expect(questionOrbitAlpha({ ...state, belt: true })).toBe(0)
    expect(questionOrbitAlpha({ ...state, belt: false })).toBeGreaterThan(0)
    expect(questionOrbitAlpha({ ...state, phase: 'approach', systemReveal: 1, belt: true })).toBe(0)
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

  test('planet focus is the surface stage: no orbit paths at all', () => {
    // 进到一颗行星就是地表。轨道椭圆是宇宙家具，回答的是「我在系统的哪里」——
    // 站在地表上时这个问题不成立，画出来就还是轨道视角。
    const state = {
      phase: 'planet-focus' as const,
      focusedOwnerKey: 'star:a',
      selectedQuestionId: 'question:2',
    }
    expect(questionOrbitAlpha({ ...state, ownerKey: 'star:a', questionId: 'question:2' })).toBe(0)
    expect(questionOrbitAlpha({ ...state, ownerKey: 'star:a', questionId: 'question:1' })).toBe(0)
    expect(questionOrbitAlpha({ ...state, ownerKey: 'star:b', questionId: 'question:3' })).toBe(0)
  })

  test('strata removes every spatial orbit and planet', () => {
    const state = { phase: 'strata' as const, focusedOwnerKey: 'star:a', selectedQuestionId: 'question:1' }
    expect(macroOrbitAlpha({ ...state, ownerKey: '1' })).toBe(0)
    expect(questionOrbitAlpha({ ...state, ownerKey: 'star:a', questionId: 'question:1' })).toBe(0)
    expect(questionPlanetVisible({ ...state, ownerKey: 'star:a' })).toBe(false)
  })

  test('a second pointer invalidates pressed feedback until every pointer ends', () => {
    const pointer = new StellarPointerPresentationController()
    pointer.pointerDown({ pointerId: 1, inputKind: 'touch', x: 10, y: 10, starKey: 'star:a' })
    expect(pointer.snapshot().pressedStarKey).toBe('a')

    pointer.pointerDown({ pointerId: 2, inputKind: 'touch', x: 12, y: 12, starKey: 'star:b' })
    expect(pointer.snapshot()).toMatchObject({ pressedStarKey: null, hoverStarKey: null, cursor: '' })
    pointer.pointerMove({ pointerId: 1, x: 11, y: 11, starKey: 'star:a' })
    pointer.pointerUp({ pointerId: 1, x: 11, y: 11, starKey: 'star:a' })
    expect(pointer.snapshot().pressedStarKey).toBeNull()
    pointer.pointerUp({ pointerId: 2, x: 12, y: 12, starKey: 'star:b' })
    expect(pointer.snapshot().pressedStarKey).toBeNull()
  })

  test.each(['pointerCancel', 'lostPointerCapture'] as const)(
    '%s forwards cancellation and clears hover, cursor, and pressed presentation feedback',
    (method) => {
      const pointer = new StellarPointerPresentationController()
      pointer.pointerMove({ pointerId: 9, x: 4, y: 5, starKey: 'star:hover' })
      pointer.pointerDown({ pointerId: 1, inputKind: 'mouse', x: 10, y: 10, starKey: 'star:pressed' })

      pointer[method](1)

      expect(pointer.snapshot()).toMatchObject({ pressedStarKey: null, hoverStarKey: null, cursor: '' })
      expect(pointer.gestureSnapshot()).toMatchObject({ activePointerId: null, pressedStarKey: null })
    },
  )

  test('pointer leave clears noncaptured hover but preserves an active captured drag', () => {
    const pointer = new StellarPointerPresentationController()
    pointer.pointerMove({ pointerId: 9, x: 4, y: 5, starKey: 'star:hover' })
    pointer.pointerLeave()
    expect(pointer.snapshot()).toMatchObject({ hoverStarKey: null, cursor: '' })

    pointer.pointerDown({ pointerId: 1, inputKind: 'mouse', x: 10, y: 10, starKey: 'star:pressed' })
    pointer.pointerLeave()
    expect(pointer.snapshot().pressedStarKey).toBe('pressed')
    expect(pointer.gestureSnapshot().activePointerId).toBe(1)
  })
})
