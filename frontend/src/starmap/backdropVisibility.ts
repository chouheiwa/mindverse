// 宇宙背景的可见度。
//
// 星云、星场、尘埃、星群环、别的恒星与轨道椭圆合起来是**背景**：它们回答
// 「我在宇宙的哪里」。一旦被观察的对象变成一颗问题行星，这个问题就不再成立
// —— 那个阶段是地表，不是轨道。背景留一点余晖也不行，那还是宇宙视角。
//
// 规则放在引擎中立处，Three 与 Babylon 共用：两个构建都在出包，口径分叉会让
// 同一份语料在两边长得不一样。

export type BackdropPhase = 'panorama' | 'approach' | 'star-focus' | 'planet-focus' | 'strata'

/** 进入恒星系后背景退让的比例，与 gl/scene.ts 的 nebulaFocusGain 同值。 */
export const BACKDROP_STAR_FOCUS_GAIN = 0.38

export function backdropGain(phase: BackdropPhase): number {
  if (phase === 'planet-focus' || phase === 'strata') return 0
  if (phase === 'approach' || phase === 'star-focus') return BACKDROP_STAR_FOCUS_GAIN
  return 1
}
