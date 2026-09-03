export type OrbitPhase = 'panorama' | 'approach' | 'star-focus' | 'planet-focus' | 'strata'

export interface OrbitPresentationState {
  readonly phase: OrbitPhase
  readonly focusedOwnerKey?: string
  readonly selectedQuestionId?: string
  readonly systemReveal?: number
}

interface OwnedOrbit extends OrbitPresentationState {
  readonly ownerKey: string
  readonly questionId?: string
}

interface OrbitLinePort {
  alpha: number
  setEnabled(enabled: boolean): void
}

export function applyOrbitLineAlpha(line: OrbitLinePort, alpha: number): void {
  line.alpha = alpha
  line.setEnabled(alpha > 0)
}

/** Macro rings are the faint, panorama-scale structure of a knowledge cluster. */
export function macroOrbitAlpha(state: OwnedOrbit): number {
  if (state.phase === 'strata') return 0
  if (state.phase === 'panorama') return 0.035
  return 0.012
}

/** One median-outer radius communicates a cluster without drawing a wire cage. */
export function selectMacroOrbitRadius(radii: readonly number[]): number | null {
  const eligible = radii.filter((radius) => radius > 1.5).sort((left, right) => left - right)
  if (eligible.length === 0) return null
  return Math.round(eligible[Math.floor(eligible.length * 0.55)])
}

export function selectDominantClusterIds(
  clusters: readonly { readonly g: number; readonly n: number }[],
  limit = 6,
): ReadonlySet<number> {
  return new Set([...clusters]
    .sort((left, right) => right.n - left.n || left.g - right.g)
    .slice(0, Math.max(0, limit))
    .map(({ g }) => g))
}

/** Question paths unfold only after the user enters their parent star system. */
export function questionOrbitAlpha(state: OwnedOrbit): number {
  if (state.phase === 'panorama' || state.phase === 'strata') return 0
  if (state.ownerKey !== state.focusedOwnerKey) return 0
  if (state.phase === 'approach') return 0.34 * reveal(state.systemReveal)
  if (state.phase === 'star-focus') return 0.34
  return state.questionId === state.selectedQuestionId ? 0.92 : 0.08
}

export function questionPlanetPresentation(state: OwnedOrbit): Readonly<{
  reveal: number
  visible: boolean
  pickable: boolean
}> {
  const owned = state.phase !== 'panorama'
    && state.phase !== 'strata'
    && state.ownerKey === state.focusedOwnerKey
  const amount = !owned ? 0 : state.phase === 'approach' ? reveal(state.systemReveal) : 1
  return Object.freeze({ reveal: amount, visible: amount > 0, pickable: amount >= 0.05 })
}

export function questionPlanetVisible(state: OwnedOrbit): boolean {
  return questionPlanetPresentation(state).visible
}

function reveal(value: number | undefined): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value as number)) : 0
}
