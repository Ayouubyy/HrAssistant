import type { ReviewFlag } from './types'

export const needsReview = (item: { flags?: ReviewFlag[]; flagsDismissed?: boolean }): boolean =>
  !item.flagsDismissed && (item.flags ?? []).some((f) => f.severity === 'high')

const RANK = { high: 2, warn: 1, info: 0 }

// Keeps one flag per code+detail, and the most severe first.
export function mergeFlags(...lists: (ReviewFlag[] | undefined)[]): ReviewFlag[] {
  const out = new Map<string, ReviewFlag>()
  for (const f of lists.flat()) if (f) out.set(`${f.code}\u0000${f.detail}`, f)
  return [...out.values()].sort((a, b) => RANK[b.severity] - RANK[a.severity])
}
