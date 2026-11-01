// States of a candidate dot on the home score strips (see components/Charts.tsx).
import { needsReview } from '@shared/flags'
import type { RankedCandidate } from '@shared/scoring'

export type DotState = 'short' | 'open' | 'out' | 'review'

export const DOT_LABEL: Record<DotState, string> = {
  short: 'Shortlisted',
  open: 'Awaiting your decision',
  out: 'Rejected or suggested',
  review: 'Needs review'
}

export function dotState(c: RankedCandidate): DotState {
  if (needsReview(c)) return 'review'
  if (c.hrDecision === 'shortlist') return 'short'
  if (c.rejected) return 'out'
  return 'open'
}
