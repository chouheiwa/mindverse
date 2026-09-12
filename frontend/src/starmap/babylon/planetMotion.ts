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

// 进了恒星系放慢，但**不停**。选中一颗行星后相机锁着它，它在屏幕上是定住的，点击
// 精度不受公转影响；反过来把公转冻成 0，整个星系就死了 —— 用户的话是「看不出来围着
// 太阳转」。held 保留给减弱动效之类真的要静止的场合。
export const ORBIT_TEMPO = Object.freeze({ panorama: 1, starFocus: 0.4, selected: 0.15, held: 0 })

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
  // 选中一颗行星后相机锁着它：你看到的是恒星绕着自己转。0.4 下 5 秒能扫过 785px，晕；
  // 0.15 大约 295px —— 看得出在走，又不至于把人晃晕。
  if (input.planetSelected) return ORBIT_TEMPO.selected
  return input.starFocused ? ORBIT_TEMPO.starFocus : ORBIT_TEMPO.panorama
}

// 自转。
//
// 选中行星时公转停住（否则它是移动靶，点中全靠运气），但自转必须继续 —— 自转不改变
// 它在屏幕上的位置，点击一样准，而画面里它是活的。之前连自转都没有：拖动转的是网格，
// 太阳在世界空间固定，明暗与轮廓一点不变，松手之后它就是一颗死球。

/**
 * 最快的一圈：18 秒。
 *
 * 之前是 45–90 秒，实测 4 秒才转 18° —— 盯着看才勉强看得出，用户的反馈就是「没有
 * 任何效果」。这是界面不是天文馆：一圈十几二十秒才读得出「它是活的」。
 */
export const PLANET_SPIN_MIN_PERIOD_MS = 18_000
/** 周期抖动范围：各行星转速不同，否则整屏同步转很假。 */
export const PLANET_SPIN_PERIOD_SPAN_MS = 14_000

const TWO_PI = Math.PI * 2

/** 自转角（弧度，落在 [0, 2π)）。周期由 seed 决定，稳定可复现。 */
export function planetSpinAngle(seed: number, frameTimeMs: number): number {
  const safeSeed = Number.isFinite(seed) ? Math.abs(Math.trunc(seed)) : 0
  const time = Number.isFinite(frameTimeMs) ? frameTimeMs : 0
  // 取一个与 seed 相关但分布均匀的比例：整数哈希后落到 [0,1)。
  const mixed = Math.imul(safeSeed ^ 0x9e3779b9, 0x85ebca6b) >>> 0
  const periodMs = PLANET_SPIN_MIN_PERIOD_MS + PLANET_SPIN_PERIOD_SPAN_MS * (mixed / 0x1_0000_0000)
  const angle = (time / periodMs) * TWO_PI
  const wrapped = angle % TWO_PI
  return Number.isFinite(wrapped) ? (wrapped < 0 ? wrapped + TWO_PI : wrapped) : 0
}
