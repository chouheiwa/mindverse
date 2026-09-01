import type { Quality } from './quality'

interface E2ERenderSnapshot {
  renderReady: boolean
  frameTimes: number[]
  memory: { geometries: number, textures: number }
  quality: Quality
  probeTransitionFrames: number
  scene: {
    planetCount: number, probeCount: number, probeNearVisible: boolean,
    firstStarX: number | null, firstStarY: number | null,
  }
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
  scene(): E2ERenderSnapshot['scene']
  quality: Quality
  probeTransitionFrames: number
}

declare global {
  interface Window {
    __MINDVERSE_E2E__?: E2EDiagnosticsApi
  }
}

let active: ActiveDiagnostics | null = null

export function forcedE2EQuality(search: string): Quality | null {
  const quality = new URLSearchParams(search).get('e2eQuality')
  return quality === 'high' || quality === 'medium' || quality === 'low' ? quality : null
}

export function installE2EDiagnostics(
  owner: object,
  quality: Quality,
  memory: () => E2ERenderSnapshot['memory'],
  scene: () => E2ERenderSnapshot['scene'],
): void {
  let state: ActiveDiagnostics
  const api: E2EDiagnosticsApi = Object.freeze({
    snapshot: (): E2ERenderSnapshot => ({
      renderReady: state.renderReady,
      frameTimes: [...state.frameTimes],
      memory: { ...state.memory() },
      quality: state.quality,
      probeTransitionFrames: state.probeTransitionFrames,
      scene: { ...state.scene() },
    }),
  })
  state = {
    owner,
    frameTimes: [],
    renderReady: false,
    memory,
    scene,
    quality,
    probeTransitionFrames: 0,
    api,
  }
  active = state
  window.__MINDVERSE_E2E__ = state.api
}

export function recordE2EFrame(owner: object, duration: number, probeNearOpacity = 0): void {
  if (active?.owner !== owner) return
  active.renderReady = true
  active.frameTimes.push(duration)
  if (probeNearOpacity > 0.001 && probeNearOpacity < 0.999) active.probeTransitionFrames += 1
  // 4,096 frames cover more than the required 30-second sample at 120Hz while
  // keeping this E2E-only, read-only buffer bounded.
  if (active.frameTimes.length > 4_096) active.frameTimes.shift()
}

export function removeE2EDiagnostics(owner: object): void {
  if (active?.owner !== owner) return
  if (window.__MINDVERSE_E2E__ === active.api) delete window.__MINDVERSE_E2E__
  active = null
}
