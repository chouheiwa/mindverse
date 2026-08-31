import type { Quality } from './quality'

interface E2ERenderSnapshot {
  renderReady: boolean
  frameTimes: number[]
  memory: { geometries: number, textures: number }
  quality: Quality
}

interface E2EDiagnosticsApi {
  snapshot(): E2ERenderSnapshot
}

interface ActiveDiagnostics {
  owner: object
  api: E2EDiagnosticsApi
  frameTimes: number[]
  renderReady: boolean
  memory(): E2ERenderSnapshot['memory']
  quality: Quality
}

declare global {
  interface Window {
    __MINDVERSE_E2E__?: E2EDiagnosticsApi
  }
}

let active: ActiveDiagnostics | null = null

export function forcedE2EQuality(search: string): Quality | null {
  const quality = new URLSearchParams(search).get('e2eQuality')
  return quality === 'medium' || quality === 'low' ? quality : null
}

export function installE2EDiagnostics(
  owner: object,
  quality: Quality,
  memory: () => E2ERenderSnapshot['memory'],
): void {
  let state: ActiveDiagnostics
  const api: E2EDiagnosticsApi = Object.freeze({
    snapshot: (): E2ERenderSnapshot => ({
      renderReady: state.renderReady,
      frameTimes: [...state.frameTimes],
      memory: { ...state.memory() },
      quality: state.quality,
    }),
  })
  state = {
    owner,
    frameTimes: [],
    renderReady: false,
    memory,
    quality,
    api,
  }
  active = state
  window.__MINDVERSE_E2E__ = state.api
}

export function recordE2EFrame(owner: object, duration: number): void {
  if (active?.owner !== owner) return
  active.renderReady = true
  active.frameTimes.push(duration)
  if (active.frameTimes.length > 120) active.frameTimes.shift()
}

export function removeE2EDiagnostics(owner: object): void {
  if (active?.owner !== owner) return
  if (window.__MINDVERSE_E2E__ === active.api) delete window.__MINDVERSE_E2E__
  active = null
}
