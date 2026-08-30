import { describe, expect, test, vi } from 'vitest'
import { findQuestionPlanet, indexPlanetsByStar, planetPickVisible, planetVisualAlpha } from './planetVisibility'
import { modeDim, renderDim } from './gl/stars'
import type { Star, Universe } from '../types'

describe('planet picking visibility', () => {
  test('matches parent-star LOD, convergence, mode, depth and frustum gates', () => {
    const base = { starPx: 40, convergence: 1, renderDim: 1, viewZ: 20, near: 10, far: 100, clipZ: 0 }
    expect(planetPickVisible(base)).toBe(true)
    expect(planetPickVisible({ ...base, starPx: 13 })).toBe(false)
    expect(planetPickVisible({ ...base, convergence: 0.9 })).toBe(false)
    expect(planetPickVisible({ ...base, renderDim: 0 })).toBe(false)
    expect(planetPickVisible({ ...base, viewZ: 100 })).toBe(false)
    expect(planetPickVisible({ ...base, clipZ: 1.01 })).toBe(false)
    expect(planetVisualAlpha(base)).toBeGreaterThan(0.004)
  })

  test('uses body renderDim for dark-star picking parity instead of the brighter interaction dim', () => {
    const star = { c: 'Dormant' } as Star
    const universe = { dark: [{ c: 'Dormant' }] } as Universe
    const interaction = modeDim(star, 'all', universe, 0)
    const rendered = renderDim(star, 'all', universe, 0)
    const base = { starPx: 40, convergence: 1, viewZ: 10, near: 1, far: 100, clipZ: 0 }

    expect(interaction).toBe(1)
    expect(rendered).toBe(0.3)
    expect(planetVisualAlpha({ ...base, renderDim: rendered }))
      .toBeCloseTo(planetVisualAlpha({ ...base, renderDim: interaction }) * 0.3)

    const nearLodEdge = { ...base, starPx: 14.7 }
    expect(planetPickVisible({ ...nearLodEdge, renderDim: interaction })).toBe(true)
    expect(planetPickVisible({ ...nearLodEdge, renderDim: rendered })).toBe(false)
  })

  test('indexes a high-cardinality planet set so picking visits only the focused system', () => {
    const a = {}
    const b = {}
    const planets = Array.from({ length: 10_000 }, (_, index) => ({ star: index < 3 ? a : b, index }))
    const byStar = indexPlanetsByStar(planets)
    const project = vi.fn()
    byStar.get(a)?.forEach(project)
    expect(project).toHaveBeenCalledTimes(3)
  })

  test('maps a semantic question route to its star-local WebGL planet', () => {
    const planets = [
      { star: { s: { id: 'star:a' } }, question: { id: 'question:7' } },
      { star: { s: { id: 'star:b' } }, question: { id: 'question:7' } },
    ]
    expect(findQuestionPlanet(planets, 'star:b', 'question:7')).toBe(planets[1])
    expect(findQuestionPlanet(planets, 'star:missing', 'question:7')).toBeNull()
  })
})
