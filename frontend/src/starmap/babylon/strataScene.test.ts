import { describe, expect, test } from 'vitest'
import { buildStrataSceneModel } from '../../domain/strata'
import { strataFixture } from '../../test/strataFixture'
import type { StrataPose } from '../rendererContract'
import {
  advanceStrataPose,
  buildCaveLayout,
  closeSpecimenFocus,
  focusSpecimen,
  snapStrataPose,
} from './strataScene'

const entryPose: StrataPose = Object.freeze({ depth: 3.25, yaw: 0.42, pitch: -0.18, snapId: null })

describe('Babylon strata cave layout', () => {
  test('copies the exact entry pose and places legal layers at domain centers', () => {
    const scene = buildStrataSceneModel(strataFixture.index, 'question:7')
    const layout = buildCaveLayout(scene, entryPose)

    expect(layout.entryPose).toEqual(entryPose)
    expect(layout.entryPose).not.toBe(entryPose)
    expect(layout.layers.map(({ centerDepth }) => centerDepth))
      .toEqual(scene.strata.map(({ centerDepth }) => centerDepth))
    expect(layout.bounds).toEqual({ minDepth: 0, maxDepth: scene.bounds.bottom, radius: 4.8 })
  })

  test('places every specimen once and routes unknown dates to the side room', () => {
    const scene = buildStrataSceneModel(strataFixture.index, 'question:7')
    const layout = buildCaveLayout(scene, entryPose)
    const answerIds = layout.specimens.map(({ answerId }) => answerId)

    expect(new Set(answerIds).size).toBe(answerIds.length)
    expect(answerIds.sort()).toEqual(strataFixture.answerIds.slice().sort())
    expect(layout.undatedRoom).not.toBeNull()
    for (const answerId of scene.undated.map(({ answerId }) => answerId)) {
      expect(layout.specimens.find((item) => item.answerId === answerId)?.room).toBe('undated')
    }
    expect(layout.specimens.every(({ x, z }) => Math.hypot(x, z) < layout.bounds.radius)).toBe(true)
  })

  test('uses a blocked shallow room without chronology or snapping for surface-only evidence', () => {
    const retrospective = buildStrataSceneModel(strataFixture.index, 'question:7')
    const surfaceOnly = {
      ...retrospective,
      evidenceLevel: 'surface-only' as const,
      surfaceSpecimens: retrospective.strata.flatMap(({ specimens }) => specimens),
      strata: [],
      undated: [],
      bounds: { top: 0, bottom: 0 },
    }
    const layout = buildCaveLayout(surfaceOnly, entryPose)

    expect(layout.layers).toEqual([])
    expect(layout.undatedRoom).toBeNull()
    expect(layout.blockedDepth).toBe(true)
    expect(layout.bounds.maxDepth).toBe(5)
    expect(snapStrataPose({ depth: 2, yaw: 0, pitch: 0, snapId: null }, layout)).toEqual({
      depth: 2,
      yaw: 0,
      pitch: 0,
      snapId: null,
    })
  })

  test('normalizes movement, clamps walls, and uses snap hysteresis', () => {
    const layout = buildCaveLayout(buildStrataSceneModel(strataFixture.index, 'question:7'), entryPose)
    const moved = advanceStrataPose(
      { depth: layout.bounds.maxDepth - 0.1, yaw: Math.PI - 0.01, pitch: 0, snapId: null },
      { forward: 99, yaw: 99, pitch: -99 },
      1,
      layout,
    )
    expect(moved.depth).toBe(layout.bounds.maxDepth)
    expect(moved.yaw).toBeLessThanOrEqual(Math.PI)
    expect(moved.pitch).toBeGreaterThanOrEqual(-1.15)

    const layer = layout.layers[0]
    const snapped = snapStrataPose({ depth: layer.centerDepth + 0.7, yaw: 0, pitch: 0, snapId: null }, layout)
    expect(snapped.snapId).toBe(layer.id)
    expect(snapped.depth).toBe(layer.centerDepth)
    expect(snapStrataPose({ ...snapped, depth: layer.centerDepth + 1.25 }, layout).snapId).toBe(layer.id)
    expect(snapStrataPose({ ...snapped, depth: layer.centerDepth + 2.1 }, layout).snapId).toBeNull()
  })

  test('side-steps for specimen focus and restores the exact prior pose once', () => {
    const layout = buildCaveLayout(buildStrataSceneModel(strataFixture.index, 'question:7'), entryPose)
    const before: StrataPose = { depth: layout.specimens[0].depth + 0.4, yaw: -0.7, pitch: 0.22, snapId: null }
    const focused = focusSpecimen(before, layout.specimens[0])

    expect(focused.pose.depth).toBe(layout.specimens[0].depth)
    expect(focused.savedPose).toEqual(before)
    expect(focused.pose).not.toEqual(before)
    expect(closeSpecimenFocus(focused)).toEqual(before)
    expect(closeSpecimenFocus(null)).toBeNull()
  })
})
