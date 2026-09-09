// 问题行星的公转时钟。
//
// 行星一直在绕恒星转。在全景里这是生命感，但**当你正要点它的时候，它是个移动
// 靶**：球在屏幕上本来就小，还在走，点中全靠运气。
//
// 所以进了恒星系就把公转停在当下 —— 不是把角度归零（那会让行星瞬移），
// 而是冻住此刻的时间戳，行星停在你看到的位置上。退出恒星系再解冻。

export interface PlanetMotionInput {
  /** 当前动画时间。 */
  readonly elapsedMs: number
  /** 进入恒星系那一刻的时间戳；null 表示没有聚焦、照常公转。 */
  readonly frozenAtMs: number | null
  readonly reducedMotion: boolean
}

/**
 * 行星定位该用的时间。
 *
 * 减弱动效下恒为 0（与既有行为一致）；聚焦恒星系时返回冻结时刻，行星原地不动。
 */
export function planetMotionTime(input: PlanetMotionInput): number {
  if (input.reducedMotion) return 0
  const frozen = input.frozenAtMs
  if (frozen !== null && Number.isFinite(frozen)) return frozen
  return Number.isFinite(input.elapsedMs) ? input.elapsedMs : 0
}
