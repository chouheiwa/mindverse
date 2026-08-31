import type { PlanetDatum } from '../starmap/gl/bodies'
import type { Mode, Star } from '../types'

export type RenderFallback = {
  kind: 'render-fallback'
  message: string
  recovery: 'reload' | 'remount'
}

export type UniverseExploration = {
  kind: 'universe'
  star: Star | null
  planet: PlanetDatum | null
  questionEntry: PlanetDatum | null
  mode: Mode
  wormIdx: number
}

export type ExplorationState = UniverseExploration | RenderFallback

export interface UniverseUiState {
  exploration: ExplorationState
  renderPhase: 'loading' | 'ready' | 'failed'
}

export type UniverseUiAction =
  | { type: 'render-loading' }
  | { type: 'render-ready' }
  | { type: 'render-failed'; message: string; recovery: RenderFallback['recovery'] }
  | { type: 'set-star'; star: Star | null }
  | { type: 'set-planet'; planet: PlanetDatum | null }
  | { type: 'set-question-entry'; questionEntry: PlanetDatum | null }
  | { type: 'set-mode'; mode: Mode }
  | { type: 'toggle-mode'; mode: Mode }
  | { type: 'set-worm'; wormIdx: number }

export const initialUniverseExploration: UniverseExploration = {
  kind: 'universe', star: null, planet: null, questionEntry: null, mode: 'all', wormIdx: 0,
}

export const initialUniverseUiState: UniverseUiState = {
  exploration: initialUniverseExploration,
  renderPhase: 'loading',
}

export function universeUiReducer(state: UniverseUiState, action: UniverseUiAction): UniverseUiState {
  switch (action.type) {
    case 'render-loading':
      return initialUniverseUiState
    case 'render-ready':
      return state.renderPhase === 'failed' ? state : { ...state, renderPhase: 'ready' }
    case 'render-failed':
      return {
        renderPhase: 'failed',
        exploration: { kind: 'render-fallback', message: action.message, recovery: action.recovery },
      }
    case 'set-star':
      return updateUniverse(state, { star: action.star })
    case 'set-planet':
      return updateUniverse(state, { planet: action.planet })
    case 'set-question-entry':
      return updateUniverse(state, { questionEntry: action.questionEntry })
    case 'set-mode':
      return updateUniverse(state, { mode: action.mode })
    case 'toggle-mode':
      return state.exploration.kind === 'universe'
        ? updateUniverse(state, { mode: state.exploration.mode === action.mode && action.mode !== 'all' ? 'all' : action.mode })
        : state
    case 'set-worm':
      return updateUniverse(state, { wormIdx: action.wormIdx })
  }
}

function updateUniverse(state: UniverseUiState, patch: Partial<Omit<UniverseExploration, 'kind'>>): UniverseUiState {
  return state.exploration.kind === 'universe'
    ? { ...state, exploration: { ...state.exploration, ...patch } }
    : state
}
