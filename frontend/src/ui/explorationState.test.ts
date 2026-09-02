import { describe, expect, expectTypeOf, test } from 'vitest'
import type { ArticleProbe, CurrentStar } from '../types'
import type { Renderer } from '../starmap/Renderer'
import type { MindverseRenderer, StrataPose } from '../starmap/rendererContract'
import type { PlanetDatum } from '../starmap/gl/bodies'
import { initialUniverseUiState, universeUiReducer } from './explorationState'

const star = { id: 'star:1', c: 'Alpha' } as CurrentStar
const otherStar = { id: 'star:2', c: 'Beta' } as CurrentStar
const probe = { id: 'article:1', url: 'https://zhuanlan.zhihu.com/p/1' } as ArticleProbe
const otherProbe = { id: 'article:2', url: 'https://zhuanlan.zhihu.com/p/2' } as ArticleProbe
const planet = { star: { s: star }, question: { id: 'question:7' } } as PlanetDatum
const pose: StrataPose = { depth: 12, yaw: 0.5, pitch: -0.2, snapId: null }

expectTypeOf<Renderer>().toMatchTypeOf<MindverseRenderer>()

describe('probe exploration state', () => {
  test('moves through approach, inspection and scanning using one discriminated state', () => {
    const focused = universeUiReducer(initialUniverseUiState, { type: 'focus-star', star })
    const approaching = universeUiReducer(focused, { type: 'approach-probe', star, probe, token: 7 })
    expect(approaching.exploration).toEqual({ kind: 'probe-approach', star, probe, token: 7, returnTo: { kind: 'star-focus', star } })
    const arrived = universeUiReducer(approaching, { type: 'probe-arrived', probeId: probe.id, token: 7 })
    expect(arrived.exploration).toMatchObject({ kind: 'probe-inspection', probe, scanComplete: false, scanError: null })
    const scanning = universeUiReducer(arrived, { type: 'scan-probe', token: 8 })
    expect(scanning.exploration).toMatchObject({ kind: 'probe-scanning', probe, token: 8 })
    const complete = universeUiReducer(scanning, { type: 'probe-scan-complete', probeId: probe.id, token: 8 })
    expect(complete.exploration).toMatchObject({ kind: 'probe-inspection', probe, scanComplete: true, scanError: null })
  })

  test('ignores late callbacks from two probes and invalidates tokens on selection and exit', () => {
    const a = universeUiReducer(universeUiReducer(initialUniverseUiState, { type: 'focus-star', star }),
      { type: 'approach-probe', star, probe, token: 1 })
    const b = universeUiReducer(a, { type: 'approach-probe', star, probe: otherProbe, token: 2 })
    expect(universeUiReducer(b, { type: 'probe-arrived', probeId: probe.id, token: 1 })).toBe(b)
    const inspection = universeUiReducer(b, { type: 'probe-arrived', probeId: otherProbe.id, token: 2 })
    const scanning = universeUiReducer(inspection, { type: 'scan-probe', token: 3 })
    expect(universeUiReducer(scanning, { type: 'probe-scan-complete', probeId: probe.id, token: 3 })).toBe(scanning)
    const switched = universeUiReducer(scanning, { type: 'focus-star', star: otherStar })
    expect(switched.exploration).toEqual({ kind: 'star-focus', star: otherStar })
    expect(universeUiReducer(switched, { type: 'probe-scan-complete', probeId: otherProbe.id, token: 3 })).toBe(switched)
    expect(universeUiReducer(scanning, { type: 'probe-error', probeId: probe.id, token: 3, message: '扫描失败，请重试。' })).toBe(scanning)
    expect(universeUiReducer(scanning, { type: 'probe-error', probeId: otherProbe.id, token: 3, message: '扫描失败，请重试。' }).exploration)
      .toMatchObject({ kind: 'probe-inspection', star, probe: otherProbe, scanComplete: false, scanError: '扫描失败，请重试。' })
    const exited = universeUiReducer(inspection, { type: 'exit-probe' })
    expect(exited.exploration).toEqual({ kind: 'star-focus', star })
  })

  test('preserves a completed article link when a rescan command fails', () => {
    const approach = universeUiReducer(universeUiReducer(initialUniverseUiState, { type: 'focus-star', star }),
      { type: 'approach-probe', star, probe, token: 4 })
    const arrived = universeUiReducer(approach, { type: 'probe-arrived', probeId: probe.id, token: 4 })
    const scan = universeUiReducer(arrived, { type: 'scan-probe', token: 5 })
    const complete = universeUiReducer(scan, { type: 'probe-scan-complete', probeId: probe.id, token: 5 })
    const rescan = universeUiReducer(complete, { type: 'scan-probe', token: 6 })
    const failed = universeUiReducer(rescan, { type: 'probe-error', probeId: probe.id, token: 6, message: '扫描失败，请重试。' })
    expect(failed.exploration).toMatchObject({ kind: 'probe-inspection', probe, scanComplete: true, scanError: '扫描失败，请重试。' })
    const retry = universeUiReducer(failed, { type: 'scan-probe', token: 7 })
    expect(retry.exploration).toMatchObject({ kind: 'probe-scanning', token: 7 })
    expect(retry.exploration).not.toHaveProperty('scanError')
    expect(universeUiReducer(retry, { type: 'probe-scan-complete', probeId: probe.id, token: 7 }).exploration)
      .toMatchObject({ kind: 'probe-inspection', probe, scanComplete: true, scanError: null })
  })
})

describe('strata exploration state', () => {
  const focusedPlanet = () => universeUiReducer(initialUniverseUiState, { type: 'focus-planet', star, planet })

  test('advances through the tokenized surface crossing into free navigation', () => {
    const focused = focusedPlanet()
    const approach = universeUiReducer(focused, { type: 'enter-strata', questionId: 'question:7', token: 11 })
    expect(approach.exploration).toMatchObject({
      kind: 'surface-approach', questionId: 'question:7', token: 11,
      returnTo: { kind: 'planet-focus', star, planet },
    })
    const crossing = universeUiReducer(approach, {
      type: 'strata-phase', questionId: 'question:7', token: 11, phase: 'surface-crossing',
    })
    expect(crossing.exploration).toMatchObject({ kind: 'surface-crossing', token: 11 })
    const free = universeUiReducer(crossing, {
      type: 'strata-phase', questionId: 'question:7', token: 11, phase: 'strata-free',
    })
    expect(free.exploration).toMatchObject({ kind: 'strata-free', token: 11 })
  })

  test('ignores stale tokens, wrong questions and backward phases', () => {
    const approach = universeUiReducer(focusedPlanet(), {
      type: 'enter-strata', questionId: 'question:7', token: 11,
    })
    expect(universeUiReducer(approach, {
      type: 'strata-phase', questionId: 'question:7', token: 12, phase: 'surface-crossing',
    })).toBe(approach)
    expect(universeUiReducer(approach, {
      type: 'strata-phase', questionId: 'question:8', token: 11, phase: 'surface-crossing',
    })).toBe(approach)
    expect(universeUiReducer(approach, {
      type: 'strata-phase', questionId: 'question:7', token: 11, phase: 'strata-free',
    })).toBe(approach)
  })

  test('snaps and releases only with the active token', () => {
    const approach = universeUiReducer(focusedPlanet(), {
      type: 'enter-strata', questionId: 'question:7', token: 11,
    })
    const crossing = universeUiReducer(approach, {
      type: 'strata-phase', questionId: 'question:7', token: 11, phase: 'surface-crossing',
    })
    const free = universeUiReducer(crossing, {
      type: 'strata-phase', questionId: 'question:7', token: 11, phase: 'strata-free',
    })
    const snapped = universeUiReducer(free, {
      type: 'strata-phase', questionId: 'question:7', token: 11, phase: 'strata-snapped', snapId: 'stratum:1',
    })
    expect(snapped.exploration).toMatchObject({ kind: 'strata-snapped', snapId: 'stratum:1' })
    expect(universeUiReducer(snapped, {
      type: 'strata-phase', questionId: 'question:7', token: 12, phase: 'strata-free',
    })).toBe(snapped)
    expect(universeUiReducer(snapped, {
      type: 'strata-phase', questionId: 'question:7', token: 11, phase: 'strata-free',
    }).exploration).toMatchObject({ kind: 'strata-free' })
  })

  test('restores the saved free pose after closing an answer specimen', () => {
    const approach = universeUiReducer(focusedPlanet(), {
      type: 'enter-strata', questionId: 'question:7', token: 11,
    })
    const crossing = universeUiReducer(approach, {
      type: 'strata-phase', questionId: 'question:7', token: 11, phase: 'surface-crossing',
    })
    const free = universeUiReducer(crossing, {
      type: 'strata-phase', questionId: 'question:7', token: 11, phase: 'strata-free',
    })
    const specimen = universeUiReducer(free, {
      type: 'focus-answer-specimen', answerId: 'answer:1', pose,
    })
    expect(specimen.exploration).toMatchObject({
      kind: 'answer-specimen-focus', answerId: 'answer:1', savedPose: pose,
    })
    expect(universeUiReducer(specimen, { type: 'close-answer-specimen' }).exploration)
      .toMatchObject({ kind: 'strata-free', restorePose: pose })
  })

  test('exits to the exact original planet and ignores stale completion', () => {
    const approach = universeUiReducer(focusedPlanet(), {
      type: 'enter-strata', questionId: 'question:7', token: 11,
    })
    const exiting = universeUiReducer(approach, { type: 'exit-strata' })
    expect(exiting.exploration).toMatchObject({ kind: 'strata-exiting', token: 11 })
    expect(universeUiReducer(exiting, {
      type: 'strata-exited', questionId: 'question:7', token: 12,
    })).toBe(exiting)
    expect(universeUiReducer(exiting, {
      type: 'strata-exited', questionId: 'question:7', token: 11,
    }).exploration).toEqual({ kind: 'planet-focus', star, planet })
  })

  test('returns to the exact observatory when strata starts from its workspace', () => {
    const observatory = universeUiReducer(focusedPlanet(), {
      type: 'set-question-entry', questionEntry: planet,
    })
    expect(observatory.exploration).toEqual({ kind: 'planet-observatory', star, planet })
    const approach = universeUiReducer(observatory, {
      type: 'enter-strata', questionId: 'question:7', token: 11,
    })
    const exiting = universeUiReducer(approach, { type: 'exit-strata' })

    expect(universeUiReducer(exiting, {
      type: 'strata-exited', questionId: 'question:7', token: 11,
    }).exploration).toEqual({ kind: 'planet-observatory', star, planet })
  })

  test('does not start strata while any probe flow owns exploration', () => {
    const probeApproach = universeUiReducer(focusedPlanet(), {
      type: 'approach-probe', star, probe, token: 4,
    })
    expect(universeUiReducer(probeApproach, {
      type: 'enter-strata', questionId: 'question:7', token: 11,
    })).toBe(probeApproach)
  })

  test('does not start a probe while a strata transition owns exploration', () => {
    const strataApproach = universeUiReducer(focusedPlanet(), {
      type: 'enter-strata', questionId: 'question:7', token: 11,
    })

    expect(universeUiReducer(strataApproach, {
      type: 'approach-probe', star, probe, token: 12,
    })).toBe(strataApproach)
  })
})
