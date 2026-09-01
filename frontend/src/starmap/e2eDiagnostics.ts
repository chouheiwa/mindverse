import type { Quality } from './quality'

export interface RenderSnapshot {
  renderReady: boolean
  frameTimes: number[]
  frameTimestampsMs: number[]
  frameSequences: number[]
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
  snapshot(): RenderSnapshot
}

interface FrameSample {
  duration: number
  timestampMs: number
  sequence: number
}

interface ActiveDiagnostics {
  owner: object
  api: E2EDiagnosticsApi
  samples: Array<FrameSample | null>
  head: number
  length: number
  lastTimestampMs: number | null
  nextSequence: number
  dropped: number
  renderReady: boolean
  memory(): RenderSnapshot['memory']
  scene(): RenderSnapshot['scene']
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
  memory: () => RenderSnapshot['memory'],
  scene: () => RenderSnapshot['scene'],
): void {
  let state: ActiveDiagnostics
  const api: E2EDiagnosticsApi = Object.freeze({
    snapshot: (): RenderSnapshot => {
      const frameTimes = new Array<number>(state.length)
      const frameTimestampsMs = new Array<number>(state.length)
      const frameSequences = new Array<number>(state.length)
      for (let logicalIndex = 0; logicalIndex < state.length; logicalIndex += 1) {
        const sample = state.samples[(state.head + logicalIndex) % E2E_FRAME_CAPACITY]
        if (sample === null) throw new Error('E2E frame ring invariant violated')
        frameTimes[logicalIndex] = sample.duration
        frameTimestampsMs[logicalIndex] = sample.timestampMs
        frameSequences[logicalIndex] = sample.sequence
      }
      return {
        renderReady: state.renderReady,
        frameTimes,
        frameTimestampsMs,
        frameSequences,
        frames: {
          firstSequence: frameSequences[0] ?? state.nextSequence,
          nextSequence: state.nextSequence,
          dropped: state.dropped,
          firstTimestampMs: frameTimestampsMs[0] ?? null,
          lastTimestampMs: frameTimestampsMs.at(-1) ?? null,
        },
        memory: { ...state.memory() },
        quality: state.quality,
        probeTransitionFrames: state.probeTransitionFrames,
        scene: { ...state.scene() },
      }
    },
  })
  state = {
    owner,
    samples: Array.from({ length: E2E_FRAME_CAPACITY }, () => null),
    head: 0,
    length: 0,
    lastTimestampMs: null,
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
  const monotonicTimestamp = active.lastTimestampMs === null
    ? timestampMs
    : Math.max(active.lastTimestampMs, timestampMs)
  const sample: FrameSample = { duration, timestampMs: monotonicTimestamp, sequence: active.nextSequence }
  if (active.length < E2E_FRAME_CAPACITY) {
    active.samples[(active.head + active.length) % E2E_FRAME_CAPACITY] = sample
    active.length += 1
  } else {
    active.samples[active.head] = sample
    active.head = (active.head + 1) % E2E_FRAME_CAPACITY
    active.dropped += 1
  }
  active.lastTimestampMs = monotonicTimestamp
  active.nextSequence += 1
  if (probeNearOpacity > 0.001 && probeNearOpacity < 0.999) active.probeTransitionFrames += 1
}

export function removeE2EDiagnostics(owner: object): void {
  if (active?.owner !== owner) return
  if (window.__MINDVERSE_E2E__ === active.api) delete window.__MINDVERSE_E2E__
  active = null
}
