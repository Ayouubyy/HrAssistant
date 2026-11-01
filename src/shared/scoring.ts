import { needsReview } from './flags'
import type { Candidate, Evaluation, JobFilter, SubScores, Weights } from './types'

const KEYS: (keyof SubScores)[] = ['skills', 'experience', 'education', 'languages']

export function weightedScore(s: SubScores, w: Weights): number {
  const total = KEYS.reduce((sum, k) => sum + w[k], 0)
  if (total <= 0) return Math.round(KEYS.reduce((sum, k) => sum + s[k], 0) / KEYS.length)
  return Math.round(KEYS.reduce((sum, k) => sum + s[k] * w[k], 0) / total)
}

// The first auto rule that catches a candidate, or null.
export function ruleReason(c: Candidate, job: JobFilter, score: number): string | null {
  if (!c.analysis) return null
  if (job.autoRejectMissingMustHave) {
    const missing = job.requirements.find(
      (r) => r.mustHave && c.analysis!.requirements.some((x) => x.requirementId === r.id && x.status === 'not_met')
    )
    if (missing) return `Missing must-have: ${missing.text}`
  }
  if (job.autoRejectBelowThreshold && score < job.threshold) return `Below threshold (${score} < ${job.threshold})`
  return null
}

// Auto rules only suggest: a candidate is rejected when HR rejects them or confirms the suggestion.
// Any HR decision (shortlist, maybe, restore) outranks the rules.
export function evaluateCandidate(c: Candidate, job: JobFilter): Evaluation {
  const score = c.analysis ? weightedScore(c.analysis.subScores, job.weights) : 0
  const none = { score, rejected: false, reason: null, suggested: false, note: null }
  if (c.hrDecision === 'reject') return { ...none, rejected: true, reason: c.rejection?.reason ?? 'Rejected by HR' }
  if (!c.analysis) return none
  const rule = ruleReason(c, job, score)
  if (!rule) return none
  if (c.hrDecision === 'shortlist' || c.hrDecision === 'maybe')
    return { ...none, note: `${c.hrDecision === 'shortlist' ? 'Shortlisted' : 'Marked maybe'} by HR · ${rule}` }
  if (c.restored) return { ...none, note: `Kept by HR · ${rule}` }
  return { ...none, rejected: true, reason: rule, suggested: true }
}

export type RankedCandidate = Candidate & Evaluation

export function rankCandidates(
  cs: Candidate[],
  job: JobFilter
): { ranked: RankedCandidate[]; rejected: RankedCandidate[]; pending: Candidate[] } {
  const pending = cs.filter((c) => c.status !== 'done')
  const evaluated = cs
    .filter((c) => c.status === 'done')
    .map((c) => ({ ...c, ...evaluateCandidate(c, job) }))
    .sort((a, b) => b.score - a.score)
  return {
    // Candidates with an undismissed high flag sit below clean ones; their score and reject status don't change.
    ranked: evaluated
      .filter((c) => !c.rejected)
      .sort((a, b) => Number(needsReview(a)) - Number(needsReview(b)) || b.score - a.score),
    // Suggestions waiting for HR first, then confirmed rejections.
    rejected: evaluated.filter((c) => c.rejected).sort((a, b) => Number(b.suggested) - Number(a.suggested) || b.score - a.score),
    pending
  }
}
