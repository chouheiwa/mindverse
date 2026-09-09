import type { Vec3 } from './cubeSphere'

// 地表阶段的状态机。
//
// 「什么时候站在地表、怎么进、怎么出」是业务规则，不该埋在渲染器的帧循环里 ——
// 埋进去就只能靠肉眼验证。抽出来之后每条规则都有用例钉着。
//
// 三段式，与用户描述的旅程一一对应：
//   descending  轨道俯冲，穿过大气层（有时长，可被打断）
//   walking     站在地面上，可环绕行走
//   digging     从脚下往地层里下潜（交给既有的 strataTransition）
//
// 关键约束是**取消要能落地**：俯冲途中退出必须回到轨道，而不是卡在半空。

export type SurfaceStagePhase = 'idle' | 'descending' | 'walking' | 'digging'

export interface SurfaceStageState {
  readonly phase: SurfaceStagePhase
  /** 本次进入的令牌。迟到的回调带着旧令牌，必须被丢弃。 */
  readonly token: number
  readonly questionId: string | null
  /** 落点方向；俯冲开始时就定下来，途中不变。 */
  readonly landing: Vec3 | null
  /** 俯冲进度 [0,1]。walking 之后恒为 1。 */
  readonly descent: number
}

export const IDLE_SURFACE_STAGE: SurfaceStageState = Object.freeze({
  phase: 'idle', token: 0, questionId: null, landing: null, descent: 0,
})

export type SurfaceStageEvent =
  | { readonly kind: 'enter'; readonly questionId: string; readonly landing: Vec3 }
  | { readonly kind: 'descend'; readonly token: number; readonly progress: number }
  | { readonly kind: 'landed'; readonly token: number }
  | { readonly kind: 'dig'; readonly token: number }
  | { readonly kind: 'surfaced'; readonly token: number }
  | { readonly kind: 'exit' }

const unit = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(v[0], v[1], v[2])
  return length > 0 && Number.isFinite(length)
    ? [v[0] / length, v[1] / length, v[2] / length]
    : [0, 1, 0]
}

/**
 * 推进一步。纯函数：同样的输入永远得到同样的输出，迟到事件一律丢弃。
 *
 * @returns 新状态。无效事件返回**原对象**，调用方可以用引用相等判断「没变化」。
 */
export function advanceSurfaceStage(
  state: SurfaceStageState,
  event: SurfaceStageEvent,
): SurfaceStageState {
  switch (event.kind) {
    case 'enter': {
      if (!event.questionId) return state
      return Object.freeze({
        phase: 'descending',
        token: state.token + 1,
        questionId: event.questionId,
        landing: normalize(event.landing),
        descent: 0,
      })
    }
    case 'descend': {
      // 迟到的帧回调带着旧令牌 —— 丢弃，否则会把新一次俯冲拽回旧进度。
      if (event.token !== state.token || state.phase !== 'descending') return state
      const descent = unit(event.progress)
      return descent === state.descent ? state : Object.freeze({ ...state, descent })
    }
    case 'landed': {
      if (event.token !== state.token || state.phase !== 'descending') return state
      return Object.freeze({ ...state, phase: 'walking', descent: 1 })
    }
    case 'dig': {
      // 只有站稳了才能往下挖：俯冲途中挖会同时跑两套相机。
      if (event.token !== state.token || state.phase !== 'walking') return state
      return Object.freeze({ ...state, phase: 'digging' })
    }
    case 'surfaced': {
      if (event.token !== state.token || state.phase !== 'digging') return state
      return Object.freeze({ ...state, phase: 'walking' })
    }
    case 'exit':
      // 任何阶段都必须能退出，包括俯冲途中 —— 否则用户会卡在半空。
      return state.phase === 'idle' ? state : IDLE_SURFACE_STAGE
    default:
      return state
  }
}

/**
 * 地表世界是否应当在场。
 *
 * 挖进地层之后**不在场**：洞穴有自己的墙，外面再裹一层地形网格没有意义，而且
 * 会把地层的明暗分层压平 —— 实测分层带交叉数从 ≥3 掉到 2，「有层次的世界」直接
 * 变成一片均匀的灰。
 */
export function surfaceWorldVisible(state: SurfaceStageState): boolean {
  return state.phase === 'descending' || state.phase === 'walking'
}

/** 天空是否可见。挖进地层之后头顶是岩层，不是天。 */
export function surfaceSkyVisible(state: SurfaceStageState): boolean {
  return state.phase === 'descending' || state.phase === 'walking'
}

/**
 * 地表是否拥有相机的 up 轴。
 *
 * 地表相机把 upVector 掰成脚下的法线；一旦地表不再驱动相机（往下挖、退回轨道），
 * up 必须交还给世界 Y。否则洞穴与宇宙都带着那个倾角一起歪 —— 实测地层的水平
 * 纹层变成斜纹，分带亮度剖面被抹平，交叉数从 ≥3 掉到 1。
 */
export function surfaceCameraUpOwned(state: SurfaceStageState): boolean {
  return state.phase === 'descending' || state.phase === 'walking'
}

/** 行走输入是否该被接受。俯冲途中与下潜中都不该能走。 */
export function surfaceWalkEnabled(state: SurfaceStageState): boolean {
  return state.phase === 'walking'
}
