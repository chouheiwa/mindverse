import { readFileSync } from 'node:fs'
import { describe, expect, test, vi } from 'vitest'
import type { MindverseRenderer } from './rendererContract'

describe('MindverseRenderer stellar focus contract', () => {
  test('requires a semantic focusStar command returning the selected domain star', () => {
    const focusStar = vi.fn<MindverseRenderer['focusStar']>(() => null)
    const renderer = { focusStar } as Pick<MindverseRenderer, 'focusStar'>
    expect(renderer.focusStar('star:missing')).toBeNull()
    expect(focusStar).toHaveBeenCalledOnce()
  })

  test('keeps the Three focus datum separate from the public command', () => {
    const source = readFileSync('src/starmap/Renderer.ts', 'utf8')
    expect(source).toContain('private focusedStar: StarDatum | null = null')
    expect(source).toMatch(/focusStar\(starKey: string\).*Star \| null/)
    expect(source).not.toContain('private focusStar: StarDatum')
  })

  test('integrates Babylon picking without per-star geometry or native click selection', () => {
    const source = readFileSync('src/starmap/babylon/BabylonRenderer.ts', 'utf8')
    expect(source).toContain('ProjectedStarCandidateBuffer')
    expect(source).toContain('CameraFlightController')
    expect(source).toMatch(/cameraFlightController\.frame\(/)
    expect(source).not.toContain('starByMeshId')
    expect(source).not.toMatch(/addEventListener\(['"]click['"]/)
    expect(source).not.toMatch(/CreateSphere\(`star:/)
  })
})
