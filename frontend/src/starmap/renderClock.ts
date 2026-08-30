export interface PausedRenderClock {
  readonly t0: number | null
  readonly skipAt: number | null
  readonly lastTouch: number
}

export function resumeRenderClock(clock: PausedRenderClock, pausedAt: number, now: number) {
  const pausedFor = Math.max(0, now - pausedAt)
  return {
    t0: clock.t0 === null ? null : clock.t0 + pausedFor,
    skipAt: clock.skipAt === null ? null : clock.skipAt + pausedFor,
    lastTouch: clock.lastTouch + pausedFor,
    lastNow: now,
  }
}
