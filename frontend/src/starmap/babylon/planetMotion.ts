// 问题行星的公转时钟：节奏，而不是开关。
//
// 全景里全速，那是生命感。进了恒星系镜头跟着恒星走 —— 公转若冻住，画面里就什么
// 都不动了；所以慢速继续。只有选中某颗行星（要点它、要落地）时才真停住：球在屏幕
// 上本来就小，还在走，点中全靠运气。
//
// 换节奏永远不跳：以当前公转时刻为锚点重新计时，行星停在你看到的位置上。

export interface OrbitClockState {
  /** 锚点：动画时间与公转时间在此对齐。 */
  readonly anchorElapsedMs: number
  readonly anchorOrbitMs: number
  /** 公转时间相对动画时间的倍率。 */
  readonly tempo: number
}

export const ORBIT_TEMPO = Object.freeze({ panorama: 1, starFocus: 0.25, held: 0 })

export const INITIAL_ORBIT_CLOCK: OrbitClockState = Object.freeze({
  anchorElapsedMs: 0, anchorOrbitMs: 0, tempo: ORBIT_TEMPO.panorama,
})

const finite = (value: number, fallback: number): number => Number.isFinite(value) ? value : fallback

/** 当前公转时间。 */
export function orbitClockTime(state: OrbitClockState, elapsedMs: number): number {
  const elapsed = finite(elapsedMs, state.anchorElapsedMs)
  return finite(state.anchorOrbitMs + (elapsed - state.anchorElapsedMs) * state.tempo, state.anchorOrbitMs)
}

/** 换节奏：以此刻的公转时刻为锚点，行星不会瞬移。节奏没变时原样返回。 */
export function retimeOrbitClock(state: OrbitClockState, elapsedMs: number, tempo: number): OrbitClockState {
  const nextTempo = Math.max(0, finite(tempo, state.tempo))
  if (nextTempo === state.tempo) return state
  const elapsed = finite(elapsedMs, state.anchorElapsedMs)
  return Object.freeze({
    anchorElapsedMs: elapsed,
    anchorOrbitMs: orbitClockTime(state, elapsed),
    tempo: nextTempo,
  })
}

/** 节奏由用户在做什么决定。 */
export function orbitTempoFor(input: Readonly<{ starFocused: boolean; planetSelected: boolean }>): number {
  if (input.planetSelected) return ORBIT_TEMPO.held
  if (input.starFocused) return ORBIT_TEMPO.starFocus
  return ORBIT_TEMPO.panorama
}
