import type { Quality } from './quality'

interface E2ERenderSnapshot {
  renderReady: boolean
  frameTimes: number[]
  frames: {
    firstSequence: number
    nextSequence: number
    dropped: number
    firstTimestampMs: number | null
    lastTimestampMs: number | null
  }
  memory: { geometries: number, textures: number }
  quality: Quality
  probeTransitionFrames: number
  scene: {
    planetCount: number, probeCount: number, probeNearVisible: boolean,
    firstStarX: number | null, firstStarY: number | null,
    cameraDistance: number, targetDistance: number,
  }
}

interface E2EDiagnosticsApi {
  snapshot(): E2ERenderSnapshot
}

interface ActiveDiagnostics {
  owner: object
  api: E2EDiagnosticsApi
  frameTimes: number[]
  frameTimestamps: number[]
  nextSequence: number
  dropped: number
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

// Covers the required 30-second measurement with five seconds of headroom,
// including high-refresh-rate (240Hz) displays.
export const E2E_FRAME_CAPACITY = 35 * 240 + 1

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
      frames: {
        firstSequence: state.nextSequence - state.frameTimes.length,
        nextSequence: state.nextSequence,
        dropped: state.dropped,
        firstTimestampMs: state.frameTimestamps[0] ?? null,
        lastTimestampMs: state.frameTimestamps.at(-1) ?? null,
      },
      memory: { ...state.memory() },
      quality: state.quality,
      probeTransitionFrames: state.probeTransitionFrames,
      scene: { ...state.scene() },
    }),
  })
  state = {
    owner,
    frameTimes: [],
    frameTimestamps: [],
    nextSequence: 0,
    dropped: 0,
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

export function recordE2EFrame(
  owner: object,
  duration: number,
  probeNearOpacity = 0,
  timestampMs = performance.now(),
): void {
  if (active?.owner !== owner) return
  active.renderReady = true
  active.frameTimes.push(duration)
  const previousTimestamp = active.frameTimestamps.at(-1)
  active.frameTimestamps.push(previousTimestamp === undefined ? timestampMs : Math.max(previousTimestamp, timestampMs))
  active.nextSequence += 1
  if (probeNearOpacity > 0.001 && probeNearOpacity < 0.999) active.probeTransitionFrames += 1
  if (active.frameTimes.length > E2E_FRAME_CAPACITY) {
    active.frameTimes.shift()
    active.frameTimestamps.shift()
    active.dropped += 1
  }
}

export function removeE2EDiagnostics(owner: object): void {
  if (active?.owner !== owner) return
  if (window.__MINDVERSE_E2E__ === active.api) delete window.__MINDVERSE_E2E__
  active = null
}
