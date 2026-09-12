import type { Quality } from './quality'

export interface RenderSnapshot {
  rendererKind: 'three' | 'babylon'
  activeContextCount: number
  scenePhase: 'universe' | 'surface-approach' | 'surface-crossing' | 'strata-free' | 'strata-snapped' | 'strata-exiting'
  projectedBounds: {
    selectedPlanet: { x: number, y: number, width: number, height: number } | null
    firstAnswerSpecimen?: { x: number, y: number, width: number, height: number } | null
    answerSpecimens?: readonly {
      answerId: string
      room: 'main' | 'undated' | 'surface'
      depth: number
      x: number
      z: number
      bounds: { x: number, y: number, width: number, height: number } | null
    }[]
    /** 落点旁的旗与石堆在屏幕上的位置。 */
    surfaceMarks?: readonly { answerId: string, x: number, y: number }[]
    /** 天上的邻居在屏幕上的位置。 */
    surfaceBeacons?: readonly { kind: 'planet' | 'wormhole', label: string, x: number, y: number }[]
    /** 小径尽头的路牌在屏幕上的位置与文字。 */
    surfaceSignpost?: { x: number, y: number, text: string } | null
  }
  lifecycle: {
    rafLoops: number
    listeners: number
    clickEvents?: number
    lastPick?: 'none' | 'star' | 'planet' | 'specimen' | 'other'
    surfacePickCalls?: number
  }
  planet: {
    selectedQuestionId: string | null
    surfaceLevel: 'low' | 'medium' | 'high' | 'lambert' | null
    surfaceFallback: boolean
    atmosphereFallback: boolean
    rotation: readonly [number, number, number, number] | null
    thermalDominant: 'magma' | 'desert' | 'rock' | 'tundra' | 'ice' | null
    highFrequencyDetail: boolean
    visible: readonly {
      questionId: string
      surfaceLevel: 'low' | 'medium' | 'high' | 'lambert'
      thermalDominant: 'magma' | 'desert' | 'rock' | 'tundra' | 'ice'
      highFrequencyDetail: boolean
      bounds: { x: number, y: number, width: number, height: number } | null
    }[]
  }
  resources: {
    highPlanetCount: number
    materializedPlanetCount?: number
    planetVisualConstructions?: number
    planetShaderCompileRequests?: number
    planetUpdatesLastFrame?: number
    actualRenderCount?: number
    /** Time spent inside one scene render, as opposed to the scheduling interval. */
    nebulaShellCount?: number
    clusterRingCount?: number
    /** 星群环实际增益。缩放淡出只能从这里观测，帧描述子看不见。 */
    clusterRingGain?: number
    wormholePointCount?: number
    darkLensCount?: number
    dustCount?: number
    soloCount?: number
    starfieldPointCount?: number
    starfieldShellCount?: number
    /** 宇宙背景增益。地表阶段必须是 0。 */
    backdropGain?: number
    /** 可环绕地表的阶段与规模。没进地表时 phase 是 idle、各计数为 0。 */
    surfaceStage?: {
      phase: 'idle' | 'descending' | 'walking' | 'digging'
      descent: number
      chunkCount: number
      meshCount: number
      builtThisUpdate: number
      vertexCount: number
      skyVisible: boolean
      groundRadius: number
      /** 相机到注视点的距离。站在地面上时远小于星球半径；被 1.2 的下限夹住时是 1.2。 */
      cameraTargetDistance?: number
      lightCount?: number
      cameraAltitude?: number
      sunElevation?: number
      markCount?: number
      beaconCount?: number
      trailSteps?: number
    }
    renderCostMs?: number
    maxRenderCostMs?: number
  }
  stellar: StellarDiagnosticsSnapshot
  p95FrameTime: number | null
  renderReady: boolean
  frameTimes: number[]
  /**
   * 逐帧渲染开销，与 frameTimes 一一对齐。
   * 峰值（maxRenderCostMs）是极值统计，单帧抖动就能支配它；要在采样窗上算出
   * 抗噪的分位数，就必须留下整条序列。
   */
  renderCosts: number[]
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
    cameraAlpha?: number, cameraBeta?: number,
    cameraTargetX?: number, cameraTargetY?: number, cameraTargetZ?: number,
    /** 相机 up 轴。只有站在地表上时才允许偏离世界 Y。 */
    cameraUp?: readonly [number, number, number],
    strataPose?: { depth: number, yaw: number, pitch: number, snapId: string | null } | null,
    undatedRoom?: { centerDepth: number, angle: number } | null,
  }
}

export interface DiagnosticBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface StellarDiagnosticsSnapshot {
  starCount: number
  projectedStars: Array<{
    starKey: string
    core: DiagnosticBounds
    halo: DiagnosticBounds
  }>
  hoveredStarKey: string | null
  hoverProgress: number
  focusedStarKey: string | null
  approachProgress: number
  /** 最近一次接近飞行的**计划**时长。减弱动效下是 120ms，正常是 900–1300ms。
   *  它是确定性事实，不受机器负载影响；用墙钟去量「有没有播长飞行」量的是测试框架。 */
  approachDurationMs: number
  /** 渲染器**当前**是否处于减弱动效。`emulateMedia` 改的是媒体查询，渲染器要等
   *  change 事件才跟上；没有这个确认点，测试就会在切换生效前抢先点击。 */
  reducedMotion: boolean
  systemReveal: number
  visibleQuestionOrbits: number
  visibleQuestionPlanets: number
  cameraSamples: Array<{
    sequence: number
    timestampMs: number
    distance: number
  }>
  shaderFallback: boolean
}

interface E2EDiagnosticsApi {
  snapshot(): RenderSnapshot
  setApproachProgress(progress: number | null): boolean
  preparePlanetCapture(): boolean
  flipFarPlanetCapture(): boolean
  /** 清零渲染开销峰值，返回是否真的落到了渲染器上。见 runtime.resetRenderCostPeak。 */
  resetRenderCostPeak(): boolean
}

interface FrameSample {
  duration: number
  timestampMs: number
  sequence: number
  /** 这一帧花在 scene.render 里的时间。见 renderCosts 字段的说明。 */
  renderCostMs: number
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
  details: E2EDiagnosticsDetails
}

export interface E2EDiagnosticsDetails {
  readonly rendererKind: 'three' | 'babylon'
  readonly activeContextCount: () => number
  readonly scenePhase: () => RenderSnapshot['scenePhase']
  readonly projectedBounds: () => RenderSnapshot['projectedBounds']
  readonly lifecycle: () => RenderSnapshot['lifecycle']
  readonly stellar?: () => StellarDiagnosticsSnapshot
  readonly planet?: () => RenderSnapshot['planet']
  readonly resources?: () => RenderSnapshot['resources']
  readonly setApproachProgress?: (progress: number | null) => boolean
  readonly preparePlanetCapture?: () => boolean
  readonly flipFarPlanetCapture?: () => boolean
  readonly resetRenderCostPeak?: () => boolean
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

export type WebGlBackend = 'metal' | 'swiftshader' | 'unknown'

export function classifyWebGlBackend(renderer: string | null, vendor: string | null): WebGlBackend {
  const evidence = `${renderer ?? ''} ${vendor ?? ''}`
  if (/swiftshader|subzero/i.test(evidence)) return 'swiftshader'
  if (/\bmetal\b/i.test(evidence)) return 'metal'
  return 'unknown'
}

export function forcedE2EQuality(search: string): Quality | null {
  const quality = new URLSearchParams(search).get('e2eQuality')
  return quality === 'high' || quality === 'medium' || quality === 'low' ? quality : null
}

export function installE2EDiagnostics(
  owner: object,
  quality: Quality,
  memory: () => RenderSnapshot['memory'],
  scene: () => RenderSnapshot['scene'],
  details: E2EDiagnosticsDetails = {
    rendererKind: 'three',
    activeContextCount: () => 1,
    scenePhase: () => 'universe',
    projectedBounds: () => ({ selectedPlanet: null }),
    lifecycle: () => ({ rafLoops: 1, listeners: 0 }),
  },
): void {
  let state: ActiveDiagnostics
  const api: E2EDiagnosticsApi = Object.freeze({
    preparePlanetCapture: (): boolean => state.details.preparePlanetCapture?.() ?? false,
    flipFarPlanetCapture: (): boolean => state.details.flipFarPlanetCapture?.() ?? false,
    resetRenderCostPeak: (): boolean => state.details.resetRenderCostPeak?.() ?? false,
    setApproachProgress: (progress: number | null): boolean => {
      if (progress !== null && (!Number.isFinite(progress) || progress < 0 || progress > 1)) return false
      return state.details.setApproachProgress?.(progress) ?? false
    },
    snapshot: (): RenderSnapshot => {
      const frameTimes = new Array<number>(state.length)
      const renderCosts = new Array<number>(state.length)
      const frameTimestampsMs = new Array<number>(state.length)
      const frameSequences = new Array<number>(state.length)
      for (let logicalIndex = 0; logicalIndex < state.length; logicalIndex += 1) {
        const sample = state.samples[(state.head + logicalIndex) % E2E_FRAME_CAPACITY]
        if (sample === null) throw new Error('E2E frame ring invariant violated')
        frameTimes[logicalIndex] = sample.duration
        renderCosts[logicalIndex] = sample.renderCostMs
        frameTimestampsMs[logicalIndex] = sample.timestampMs
        frameSequences[logicalIndex] = sample.sequence
      }
      return {
        rendererKind: state.details.rendererKind,
        activeContextCount: state.details.activeContextCount(),
        scenePhase: state.details.scenePhase(),
        projectedBounds: structuredClone(state.details.projectedBounds()),
        lifecycle: { ...state.details.lifecycle() },
        planet: structuredClone(state.details.planet?.() ?? {
          selectedQuestionId: null,
          surfaceLevel: null,
          surfaceFallback: false,
          atmosphereFallback: false,
          rotation: null,
          thermalDominant: null,
          highFrequencyDetail: false,
          visible: [],
        }),
        resources: { ...(state.details.resources?.() ?? { highPlanetCount: 0 }) },
        stellar: structuredClone(state.details.stellar?.() ?? {
          starCount: 0,
          projectedStars: [],
          hoveredStarKey: null,
          hoverProgress: 0,
          focusedStarKey: null,
          approachProgress: 0,
          approachDurationMs: 0,
          reducedMotion: false,
          systemReveal: 0,
          visibleQuestionOrbits: 0,
          visibleQuestionPlanets: 0,
          cameraSamples: [],
          shaderFallback: false,
        }),
        p95FrameTime: p95FrameTime(frameTimes),
        renderReady: state.renderReady,
        frameTimes,
        renderCosts,
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
    details,
    api,
  }
  active = state
  window.__MINDVERSE_E2E__ = state.api
}

export function p95FrameTime(samples: readonly number[]): number | null {
  if (samples.length === 0) return null
  const sorted = [...samples].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)]
}

export function recordE2EFrame(
  owner: object,
  duration: number,
  probeNearOpacity = 0,
  timestampMs = performance.now(),
  renderCostMs = 0,
): void {
  if (active?.owner !== owner) return
  active.renderReady = true
  const monotonicTimestamp = active.lastTimestampMs === null
    ? timestampMs
    : Math.max(active.lastTimestampMs, timestampMs)
  const sample: FrameSample = {
    duration, timestampMs: monotonicTimestamp, sequence: active.nextSequence, renderCostMs,
  }
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
