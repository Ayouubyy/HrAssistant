import { needsReview } from './flags'
import type { Candidate, Evaluation, JobFilter, SubScores, Weights } from './types'

const KEYS: (keyof SubScores)[] = ['skills', 'experience', 'education', 'languages']

export function weightedScore(s: SubScores, w: Weights): number {
  const total = KEYS.reduce((sum, k) => sum + w[k], 0)
  if (total <= 0) return Math.round(KEYS.reduce((sum, k) => sum + s[k], 0) / KEYS.length)
  return Math.round(KEYS.reduce((sum, k) => sum + s[k] * w[k], 0) / total)
}

export function evaluateCandidate(c: Candidate, job: JobFilter): Evaluation {
  const score = c.analysis ? weightedScore(c.analysis.subScores, job.weights) : 0
  if (c.hrDecision === 'reject') return { score, rejected: true, reason: 'Rejected by HR' }
  if (c.restored || !c.analysis) return { score, rejected: false, reason: null }

  if (job.autoRejectMissingMustHave) {
    const missing = job.requirements.find(
      (r) =>
        r.mustHave &&
        c.analysis!.requirements.some((x) => x.requirementId === r.id && x.status === 'not_met')
    )
    if (missing) return { score, rejected: true, reason: `Missing must-have: ${missing.text}` }
  }
  if (job.autoRejectBelowThreshold && score < job.threshold) {
    return { score, rejected: true, reason: `Below threshold (${score} < ${job.threshold})` }
  }
  return { score, rejected: false, reason: null }
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
    rejected: evaluated.filter((c) => c.rejected),
    pending
  }
}
