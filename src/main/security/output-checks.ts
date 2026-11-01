import { weightedScore } from '../../shared/scoring'
import type { CandidateAnalysis, JobFilter, ReviewFlag } from '../../shared/types'
import { normalizeForScan } from './injection'

export const tokens = (s: string): string[] =>
  normalizeForScan(s)
    .replace(/["'.,;:!?()[\]{}…·•|/،؛؟]/g, ' ')
    .replace(/(^|\s)-+(?=\s|$)/g, ' ')
    .split(' ')
    .filter(Boolean)

// True when at least 80% of the quote's words appear close together in the CV. Word order inside the
// window is ignored, since the model often joins two nearby fragments or drops a word.
export function quoteInText(quote: string, cvTokens: string[]): boolean {
  const q = tokens(quote)
  if (!q.length) return true
  const need = Math.ceil(q.length * 0.8)
  const window = q.length * 2 + 6
  const anchors = new Set(q.slice(0, 3))
  for (let start = 0; start < cvTokens.length; start++) {
    if (!anchors.has(cvTokens[start])) continue
    const bag = new Map<string, number>()
    for (const t of cvTokens.slice(start, start + window)) bag.set(t, (bag.get(t) ?? 0) + 1)
    let found = 0
    for (const t of q) {
      const n = bag.get(t) ?? 0
      if (n > 0) {
        found++
        bag.set(t, n - 1)
      }
    }
    if (found >= need) return true
  }
  return false
}

const shortQuote = (s: string): string => (s.length > 60 ? `${s.slice(0, 57)}…` : s)

// Arabic text pulled from a PDF often comes out with words reordered and letters split, so quotes
// from it can't be matched reliably; those CVs skip the quote check.
export const quotesCheckable = (fileName: string, text: string): boolean =>
  !(fileName.toLowerCase().endsWith('.pdf') && /[؀-ۿ]/.test(text))

export function checkAnalysis(
  a: CandidateAnalysis,
  job: JobFilter,
  cvText: string,
  injected: boolean,
  checkQuotes = true
): ReviewFlag[] {
  const flags: ReviewFlag[] = []
  const cv = tokens(cvText)
  const withQuote = a.requirements.filter((r) => r.evidence.trim())
  const missing = checkQuotes ? withQuote.filter((r) => !quoteInText(r.evidence, cv)) : []
  const mustIds = new Set(job.requirements.filter((r) => r.mustHave).map((r) => r.id))
  const fakeMust = missing.filter((r) => r.status === 'met' && mustIds.has(r.requirementId))
  const share = withQuote.length ? missing.length / withQuote.length : 0

  if (missing.length && (share > 0.3 || fakeMust.length)) {
    flags.push({
      code: 'quote_not_found',
      // one paraphrased quote is common; several invented ones are not
      severity: share >= 0.5 || (fakeMust.length && missing.length >= 2) ? 'high' : 'warn',
      detail: `${missing.length} of ${withQuote.length} evidence quotes aren't in the CV${fakeMust.length ? ', including a must-have marked as met' : ''}.`,
      evidence: missing.map((r) => `“${shortQuote(r.evidence)}”`).join(' ').slice(0, 120)
    })
  }

  const score = weightedScore(a.subScores, job.weights)
  const s = a.subScores
  const anomalies: string[] = []
  if (score >= 90 && withQuote.length - missing.length < a.requirements.length / 2)
    anomalies.push(`score ${score} with fewer than half the requirements backed by a quote`)
  if (s.skills >= 98 && s.experience >= 98 && s.education >= 98 && s.languages >= 98) anomalies.push('every sub-score is 98 or more')
  const emptyMust = a.requirements.filter((r) => r.status === 'met' && mustIds.has(r.requirementId) && !r.evidence.trim())
  if (emptyMust.length) anomalies.push('a must-have is marked as met with no quote')
  if (a.requirements.length && s.skills > 80 && a.requirements.every((r) => r.status !== 'met'))
    anomalies.push(`skills scored ${s.skills} while no requirement is met`)
  if (anomalies.length) {
    const quoteTrouble = flags.some((f) => f.severity === 'high')
    flags.push({
      code: 'score_anomaly',
      // an excellent CV can legitimately score 100; it needs a second signal to block the top spot
      severity: injected || quoteTrouble ? 'high' : 'warn',
      detail: `Unusual result: ${anomalies.join('; ')}.`
    })
  }
  return flags
}

// Injection attempts plus a passing score: both become high so HR sees why the score may be inflated.
export function escalate(flags: ReviewFlag[], score: number, threshold: number): ReviewFlag[] {
  const injected = flags.some((f) => f.code === 'injection_phrase' || f.code === 'model_reported_injection' || f.code === 'hidden_text')
  if (!injected || score < threshold) return flags
  return flags.map((f) =>
    ['injection_phrase', 'model_reported_injection', 'hidden_text', 'score_anomaly'].includes(f.code) ? { ...f, severity: 'high' } : f
  )
}

const shingles = (t: string[], n: number): Set<string> => {
  const out = new Set<string>()
  for (let i = 0; i + n <= t.length; i++) out.add(t.slice(i, i + n).join(' '))
  return out
}

// T-11: a CV that copies the job description shares many 5-word sequences with it.
export function jdCopy(cvText: string, jd: string): ReviewFlag[] {
  const cv = tokens(cvText)
  const j = tokens(jd)
  if (j.length < 20) return []
  const a = shingles(cv, 5)
  const b = shingles(j, 5)
  let shared = 0
  for (const s of b) if (a.has(s)) shared++
  const ratio = shared / Math.max(1, b.size)
  if (ratio < 0.25) return []
  // longest run of the JD found verbatim in the CV
  const cvJoined = ` ${cv.join(' ')} `
  let best: string[] = []
  for (let i = 0; i + 5 <= j.length; i++) {
    let k = i + 5
    if (!cvJoined.includes(` ${j.slice(i, k).join(' ')} `)) continue
    while (k < j.length && cvJoined.includes(` ${j.slice(i, k + 1).join(' ')} `)) k++
    if (k - i > best.length) best = j.slice(i, k)
  }
  return [
    {
      code: 'jd_copy',
      severity: ratio >= 0.5 ? 'high' : 'warn',
      detail: `${Math.round(ratio * 100)}% of the job description's phrases appear word for word in this CV.`,
      evidence: shortQuote(best.join(' '))
    }
  ]
}

// T-11: the same requirement keyword repeated many times, as in a pasted keyword list.
export function keywordStuffing(cvText: string, job: JobFilter): ReviewFlag[] {
  const cv = tokens(cvText)
  const counts = new Map<string, number>()
  for (const t of cv) counts.set(t, (counts.get(t) ?? 0) + 1)
  const stuffed = [...new Set(job.requirements.flatMap((r) => tokens(r.text)).filter((w) => w.length >= 4))]
    .map((w) => [w, counts.get(w) ?? 0] as const)
    .filter(([, n]) => n >= 12 && n / Math.max(1, cv.length) > 0.02)
  if (!stuffed.length) return []
  return [
    {
      code: 'keyword_stuffing',
      severity: 'info',
      detail: 'Some job keywords are repeated far more than usual.',
      evidence: stuffed.map(([w, n]) => `${w} ×${n}`).join(', ')
    }
  ]
}
