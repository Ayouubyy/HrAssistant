// Wrong-PIN throttling (T-28): after 5 failures, wait 30 s, then 60 s, 120 s… up to an hour.
export interface ThrottleState {
  failures: number
  lockedUntil: number
}

export const FREE_TRIES = 5

export function afterFailure(s: ThrottleState, now: number): ThrottleState {
  const failures = s.failures + 1
  const wait = failures >= FREE_TRIES ? Math.min(3_600_000, 30_000 * 2 ** (failures - FREE_TRIES)) : 0
  return { failures, lockedUntil: wait ? now + wait : 0 }
}

export function waitSeconds(s: ThrottleState, now: number): number {
  return s.lockedUntil > now ? Math.ceil((s.lockedUntil - now) / 1000) : 0
}
