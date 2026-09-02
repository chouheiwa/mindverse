import type { PlanetDatum } from '../starmap/gl/bodies'
import type { ArticleProbe, Mode, Star } from '../types'
import type { StrataPhase, StrataPose } from '../starmap/rendererContract'

export type RenderFallback = { kind: 'render-fallback'; message: string; recovery: 'reload' | 'remount' }
export type ReturnState =
  | { kind: 'star-focus'; star: Star }
  | { kind: 'planet-focus'; star: Star; planet: PlanetDatum }
  | { kind: 'planet-observatory'; star: Star; planet: PlanetDatum }
type StrataBase = {
  star: Star
  questionId: string
  token: number
  returnTo: Extract<ReturnState, { kind: 'planet-focus' | 'planet-observatory' }>
}
export type StrataExplorationState = StrataBase & (
  | { kind: 'surface-approach' }
  | { kind: 'surface-crossing' }
  | { kind: 'strata-free'; restorePose?: StrataPose }
  | { kind: 'strata-snapped'; snapId: string; restorePose?: StrataPose }
  | { kind: 'answer-specimen-focus'; answerId: string; savedPose: StrataPose; resumeKind: 'strata-free' | 'strata-snapped'; snapId: string | null }
  | { kind: 'strata-exiting' }
)
export type ExplorationState =
  | { kind: 'panorama' }
  | ReturnState
  | { kind: 'probe-approach'; star: Star; probe: ArticleProbe; token: number; returnTo: ReturnState }
  | { kind: 'probe-inspection'; star: Star; probe: ArticleProbe; scanComplete: boolean; scanError: string | null; returnTo: ReturnState }
  | { kind: 'probe-scanning'; star: Star; probe: ArticleProbe; token: number; scanComplete: boolean; returnTo: ReturnState }
  | StrataExplorationState
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
  | { type: 'probe-error'; probeId: string; token: number; message: string }
  | { type: 'exit-probe' }
  | { type: 'enter-strata'; questionId: string; token: number }
  | { type: 'strata-phase'; questionId: string; token: number; phase: StrataPhase; snapId?: string }
  | { type: 'focus-answer-specimen'; answerId: string; pose: StrataPose }
  | { type: 'close-answer-specimen' }
  | { type: 'exit-strata' }
  | { type: 'strata-exited'; questionId: string; token: number }
  | { type: 'strata-error'; questionId: string; token: number }
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
    case 'approach-probe': return isStrataState(state.exploration) ? state : { ...state, questionEntry: null, exploration: {
      kind: 'probe-approach', star: action.star, probe: action.probe, token: action.token,
      returnTo: returnState(state.exploration, action.star),
    } }
    case 'probe-arrived': {
      const current = state.exploration
      if (current.kind !== 'probe-approach' || current.token !== action.token || current.probe.id !== action.probeId) return state
      return { ...state, exploration: { kind: 'probe-inspection', star: current.star, probe: current.probe,
        scanComplete: false, scanError: null, returnTo: current.returnTo } }
    }
    case 'scan-probe': {
      const current = state.exploration
      if (current.kind !== 'probe-inspection') return state
      return { ...state, exploration: { kind: 'probe-scanning', star: current.star, probe: current.probe, token: action.token, scanComplete: current.scanComplete, returnTo: current.returnTo } }
    }
    case 'probe-scan-complete': {
      const current = state.exploration
      if (current.kind !== 'probe-scanning' || current.token !== action.token || current.probe.id !== action.probeId) return state
      return { ...state, exploration: { kind: 'probe-inspection', star: current.star, probe: current.probe,
        scanComplete: true, scanError: null, returnTo: current.returnTo } }
    }
    case 'probe-error': {
      const current = state.exploration
      if ((current.kind !== 'probe-approach' && current.kind !== 'probe-scanning')
        || current.token !== action.token || current.probe.id !== action.probeId) return state
      if (current.kind === 'probe-approach') return { ...state, exploration: current.returnTo }
      return { ...state, exploration: { kind: 'probe-inspection', star: current.star, probe: current.probe,
        scanComplete: current.scanComplete, scanError: action.message, returnTo: current.returnTo } }
    }
    case 'exit-probe': return isProbeState(state.exploration) ? { ...state, exploration: state.exploration.returnTo } : state
    case 'enter-strata': {
      const current = state.exploration
      if ((current.kind !== 'planet-focus' && current.kind !== 'planet-observatory')
        || current.planet.question.id !== action.questionId) return state
      return { ...state, exploration: {
        kind: 'surface-approach', star: current.star, questionId: action.questionId,
        token: action.token, returnTo: current,
      } }
    }
    case 'strata-phase': return applyStrataPhase(state, action)
    case 'focus-answer-specimen': {
      const current = state.exploration
      if (current.kind !== 'strata-free' && current.kind !== 'strata-snapped') return state
      return { ...state, exploration: {
        kind: 'answer-specimen-focus', star: current.star, questionId: current.questionId,
        token: current.token, returnTo: current.returnTo, answerId: action.answerId,
        savedPose: action.pose, resumeKind: current.kind,
        snapId: current.kind === 'strata-snapped' ? current.snapId : null,
      } }
    }
    case 'close-answer-specimen': {
      const current = state.exploration
      if (current.kind !== 'answer-specimen-focus') return state
      const base = {
        star: current.star, questionId: current.questionId, token: current.token,
        returnTo: current.returnTo, restorePose: current.savedPose,
      }
      return { ...state, exploration: current.resumeKind === 'strata-snapped' && current.snapId
        ? { kind: 'strata-snapped', ...base, snapId: current.snapId }
        : { kind: 'strata-free', ...base } }
    }
    case 'exit-strata': {
      const current = state.exploration
      if (!isStrataState(current) || current.kind === 'strata-exiting') return state
      return { ...state, exploration: {
        kind: 'strata-exiting', star: current.star, questionId: current.questionId,
        token: current.token, returnTo: current.returnTo,
      } }
    }
    case 'strata-exited':
    case 'strata-error': {
      const current = state.exploration
      if (!isStrataState(current) || current.token !== action.token || current.questionId !== action.questionId) return state
      return { ...state, exploration: current.returnTo }
    }
    case 'set-question-entry': {
      if (action.questionEntry) return { ...state, questionEntry: action.questionEntry, exploration: {
        kind: 'planet-observatory', star: action.questionEntry.star.s, planet: action.questionEntry,
      } }
      const current = state.exploration
      return { ...state, questionEntry: null, exploration: current.kind === 'planet-observatory'
        ? { kind: 'planet-focus', star: current.star, planet: current.planet }
        : current }
    }
    case 'set-mode': return { ...state, mode: action.mode }
    case 'toggle-mode': return { ...state, mode: state.mode === action.mode && action.mode !== 'all' ? 'all' : action.mode }
    case 'set-worm': return { ...state, wormIdx: action.wormIdx }
  }
}

function explorationStar(state: ExplorationState): Star | null { return 'star' in state ? state.star : null }
function returnState(state: ExplorationState, fallback: Star): ReturnState {
  if (state.kind === 'planet-focus' || state.kind === 'planet-observatory' || state.kind === 'star-focus') return state
  if (isProbeState(state)) return state.returnTo
  return { kind: 'star-focus', star: fallback }
}

function isStrataState(state: ExplorationState): state is StrataExplorationState {
  return state.kind === 'surface-approach' || state.kind === 'surface-crossing'
    || state.kind === 'strata-free' || state.kind === 'strata-snapped'
    || state.kind === 'answer-specimen-focus' || state.kind === 'strata-exiting'
}

function applyStrataPhase(
  state: UniverseUiState,
  action: Extract<UniverseUiAction, { type: 'strata-phase' }>,
): UniverseUiState {
  const current = state.exploration
  if (!isStrataState(current) || current.kind === 'answer-specimen-focus' || current.kind === 'strata-exiting'
    || current.token !== action.token || current.questionId !== action.questionId) return state
  const allowed = (current.kind === 'surface-approach' && action.phase === 'surface-crossing')
    || (current.kind === 'surface-crossing' && action.phase === 'strata-free')
    || (current.kind === 'strata-free' && action.phase === 'strata-snapped')
    || (current.kind === 'strata-snapped' && action.phase === 'strata-free')
  if (!allowed) return state
  const base = {
    star: current.star, questionId: current.questionId, token: current.token, returnTo: current.returnTo,
  }
  if (action.phase === 'strata-snapped') {
    if (!action.snapId) return state
    return { ...state, exploration: { kind: 'strata-snapped', ...base, snapId: action.snapId } }
  }
  return { ...state, exploration: { kind: action.phase, ...base } }
}
function isProbeState(state: ExplorationState): state is Extract<ExplorationState, { kind: 'probe-approach' | 'probe-inspection' | 'probe-scanning' }> {
  return state.kind === 'probe-approach' || state.kind === 'probe-inspection' || state.kind === 'probe-scanning'
}
