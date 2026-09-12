export interface DescentClock {
  readonly elapsedMs: number
  readonly started: boolean
}

export const IDLE_DESCENT_CLOCK: DescentClock = Object.freeze({
  elapsedMs: 0, started: false,
})

export interface DescentTick {
  readonly frameDeltaMs: number
  readonly worldReady: boolean
  readonly totalMs: number
  readonly reducedMotion: boolean
}

// Metal 真机采样 472 帧：最差 2086.5ms，其余均 ≤14.2ms；同帧创建 303 个地形块，
// 并首次编译地表着色器。墙钟会吞掉等待时间，原来的单帧 1/8 限制又让 1100ms 俯冲
// 在 8 次渲染（约 115ms）内放完。固定 34ms（约两帧 60fps）才能让慢机器保留过渡。
export const MAX_DESCENT_FRAME_STEP_MS = 34

const nonnegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0

const unit = (value: number): number => Math.min(1, nonnegative(value))

export function advanceDescent(clock: DescentClock, tick: DescentTick): DescentClock {
  const started = clock.started || tick.worldReady
  const previousMs = nonnegative(clock.elapsedMs)
  const totalMs = nonnegative(tick.totalMs)
  const stepMs = Math.min(MAX_DESCENT_FRAME_STEP_MS, nonnegative(tick.frameDeltaMs))
  // 等世界可见再启动；一旦启动便锁存，避免就绪信号抖动令相机反复停顿。
  // 时长缩短也不能倒退；先限制剩余推进量，同时避免极大有限数相加溢出。
  const elapsedMs = started
    ? previousMs + Math.min(stepMs, Math.max(0, totalMs - previousMs))
    : 0
  return started === clock.started && elapsedMs === clock.elapsedMs
    ? Object.freeze(clock)
    : Object.freeze({ elapsedMs, started })
}

export function descentProgress(
  clock: DescentClock,
  totalMs: number,
  reducedMotion: boolean,
): number {
  // 无动画偏好只改变呈现进度，不让时钟绕开单帧上限，切换偏好时仍保留连续时间。
  const durationMs = nonnegative(totalMs)
  if (reducedMotion || durationMs <= 0) return 1
  if (!clock.started) return 0
  // 先夹 elapsed 再相除，避免极短时长把除法结果推成 Infinity。
  return Math.min(durationMs, nonnegative(clock.elapsedMs)) / durationMs
}

export function descentEase(progress: number): number {
  const p = unit(progress)
  return p * p * (3 - 2 * p)
}
