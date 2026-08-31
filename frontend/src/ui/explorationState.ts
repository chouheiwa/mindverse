import type { PlanetDatum } from '../starmap/gl/bodies'
import type { ArticleProbe, Mode, Star } from '../types'

export type RenderFallback = { kind: 'render-fallback'; message: string; recovery: 'reload' | 'remount' }
export type ReturnState =
  | { kind: 'star-focus'; star: Star }
  | { kind: 'planet-focus'; star: Star; planet: PlanetDatum }
export type ExplorationState =
  | { kind: 'panorama' }
  | ReturnState
  | { kind: 'probe-approach'; star: Star; probe: ArticleProbe; token: number; returnTo: ReturnState }
  | { kind: 'probe-inspection'; star: Star; probe: ArticleProbe; scanComplete: boolean; returnTo: ReturnState }
  | { kind: 'probe-scanning'; star: Star; probe: ArticleProbe; token: number; scanComplete: boolean; returnTo: ReturnState }
  | RenderFallback

export interface UniverseUiState {
  exploration: ExplorationState
  renderPhase: 'loading' | 'ready' | 'failed'
  questionEntry: PlanetDatum | null
  mode: Mode
  wormIdx: number
}

export type UniverseUiAction =
  | { type: 'render-loading' } | { type: 'render-ready' }
  | { type: 'render-failed'; message: string; recovery: RenderFallback['recovery'] }
  | { type: 'focus-star'; star: Star } | { type: 'show-panorama' }
  | { type: 'focus-planet'; star: Star; planet: PlanetDatum } | { type: 'clear-planet' }
  | { type: 'approach-probe'; star: Star; probe: ArticleProbe; token: number }
  | { type: 'probe-arrived'; probeId: string; token: number }
  | { type: 'scan-probe'; token: number }
  | { type: 'probe-scan-complete'; probeId: string; token: number }
  | { type: 'probe-error'; probeId: string; token: number }
  | { type: 'exit-probe' }
  | { type: 'set-question-entry'; questionEntry: PlanetDatum | null }
  | { type: 'set-mode'; mode: Mode } | { type: 'toggle-mode'; mode: Mode }
  | { type: 'set-worm'; wormIdx: number }

export const initialUniverseExploration: ExplorationState = { kind: 'panorama' }
export const initialUniverseUiState: UniverseUiState = {
  exploration: initialUniverseExploration, renderPhase: 'loading', questionEntry: null, mode: 'all', wormIdx: 0,
}

export function universeUiReducer(state: UniverseUiState, action: UniverseUiAction): UniverseUiState {
  switch (action.type) {
    case 'render-loading': return initialUniverseUiState
    case 'render-ready': return state.renderPhase === 'failed' ? state : { ...state, renderPhase: 'ready' }
    case 'render-failed': return { ...state, renderPhase: 'failed', exploration: { kind: 'render-fallback', message: action.message, recovery: action.recovery } }
    case 'focus-star': return { ...state, questionEntry: null, exploration: { kind: 'star-focus', star: action.star } }
    case 'show-panorama': return { ...state, questionEntry: null, exploration: { kind: 'panorama' } }
    case 'focus-planet': return { ...state, questionEntry: null, exploration: { kind: 'planet-focus', star: action.star, planet: action.planet } }
    case 'clear-planet': {
      const star = explorationStar(state.exploration)
      return { ...state, exploration: star ? { kind: 'star-focus', star } : { kind: 'panorama' } }
    }
    case 'approach-probe': return { ...state, questionEntry: null, exploration: {
      kind: 'probe-approach', star: action.star, probe: action.probe, token: action.token,
      returnTo: returnState(state.exploration, action.star),
    } }
    case 'probe-arrived': {
      const current = state.exploration
      if (current.kind !== 'probe-approach' || current.token !== action.token || current.probe.id !== action.probeId) return state
      return { ...state, exploration: { kind: 'probe-inspection', star: current.star, probe: current.probe, scanComplete: false, returnTo: current.returnTo } }
    }
    case 'scan-probe': {
      const current = state.exploration
      if (current.kind !== 'probe-inspection') return state
      return { ...state, exploration: { kind: 'probe-scanning', star: current.star, probe: current.probe, token: action.token, scanComplete: current.scanComplete, returnTo: current.returnTo } }
    }
    case 'probe-scan-complete': {
      const current = state.exploration
      if (current.kind !== 'probe-scanning' || current.token !== action.token || current.probe.id !== action.probeId) return state
      return { ...state, exploration: { kind: 'probe-inspection', star: current.star, probe: current.probe, scanComplete: true, returnTo: current.returnTo } }
    }
    case 'probe-error': {
      const current = state.exploration
      if ((current.kind !== 'probe-approach' && current.kind !== 'probe-scanning')
        || current.token !== action.token || current.probe.id !== action.probeId) return state
      if (current.kind === 'probe-approach') return { ...state, exploration: current.returnTo }
      return { ...state, exploration: { kind: 'probe-inspection', star: current.star, probe: current.probe,
        scanComplete: current.scanComplete, returnTo: current.returnTo } }
    }
    case 'exit-probe': return isProbeState(state.exploration) ? { ...state, exploration: state.exploration.returnTo } : state
    case 'set-question-entry': return { ...state, questionEntry: action.questionEntry }
    case 'set-mode': return { ...state, mode: action.mode }
    case 'toggle-mode': return { ...state, mode: state.mode === action.mode && action.mode !== 'all' ? 'all' : action.mode }
    case 'set-worm': return { ...state, wormIdx: action.wormIdx }
  }
}

function explorationStar(state: ExplorationState): Star | null { return 'star' in state ? state.star : null }
function returnState(state: ExplorationState, fallback: Star): ReturnState {
  if (state.kind === 'planet-focus' || state.kind === 'star-focus') return state
  if (isProbeState(state)) return state.returnTo
  return { kind: 'star-focus', star: fallback }
}
function isProbeState(state: ExplorationState): state is Extract<ExplorationState, { kind: 'probe-approach' | 'probe-inspection' | 'probe-scanning' }> {
  return state.kind === 'probe-approach' || state.kind === 'probe-inspection' || state.kind === 'probe-scanning'
}
