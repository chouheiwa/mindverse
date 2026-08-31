import { describe, expect, test } from 'vitest'
import type { ArticleProbe, CurrentStar } from '../types'
import { initialUniverseUiState, universeUiReducer } from './explorationState'

const star = { id: 'star:1', c: 'Alpha' } as CurrentStar
const otherStar = { id: 'star:2', c: 'Beta' } as CurrentStar
const probe = { id: 'article:1', url: 'https://zhuanlan.zhihu.com/p/1' } as ArticleProbe
const otherProbe = { id: 'article:2', url: 'https://zhuanlan.zhihu.com/p/2' } as ArticleProbe

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
