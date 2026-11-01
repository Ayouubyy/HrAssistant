import { describe, expect, it } from 'vitest'
import { evaluateCandidate, rankCandidates, weightedScore } from '../src/shared/scoring'
import type { Candidate, CandidateAnalysis, JobFilter, SubScores } from '../src/shared/types'

const job = (over: Partial<JobFilter> = {}): JobFilter => ({
  id: 'j1',
  title: 'Credit analyst',
  description: '',
  preset: 'banking',
  requirements: [
    { id: 'r1', text: 'Finance degree', mustHave: true },
    { id: 'r2', text: 'Basel III', mustHave: false }
  ],
  weights: { skills: 1, experience: 1, education: 1, languages: 1 },
  threshold: 60,
  autoRejectMissingMustHave: true,
  autoRejectBelowThreshold: true,
  createdAt: '',
  ...over
})

const analysis = (sub: SubScores, r1: 'met' | 'not_met' | 'unclear' = 'met'): CandidateAnalysis => ({
  identity: { name: 'X', email: null, phone: null },
  yearsExperience: 3,
  languages: [],
  subScores: sub,
  requirements: [
    { requirementId: 'r1', status: r1, evidence: '' },
    { requirementId: 'r2', status: 'not_met', evidence: '' }
  ],
  matchedSkills: [],
  missingSkills: [],
  redFlags: [],
  verdict: ''
})

const cand = (id: string, a?: CandidateAnalysis, over: Partial<Candidate> = {}): Candidate => ({
  id,
  jobId: 'j1',
  fileName: id + '.pdf',
  filePath: '',
  fileHash: id,
  source: 'upload',
  status: a ? 'done' : 'pending',
  analysis: a,
  hrDecision: null,
  restored: false,
  revealed: false,
  ...over
})

const flat = (n: number): SubScores => ({ skills: n, experience: n, education: n, languages: n })

describe('weightedScore', () => {
  it('weights sub-scores and rounds', () => {
    expect(
      weightedScore(
        { skills: 90, experience: 80, education: 70, languages: 60 },
        { skills: 5, experience: 3, education: 1, languages: 1 }
      )
    ).toBe(82)
  })
  it('uses a plain average when all weights are zero', () => {
    expect(
      weightedScore(
        { skills: 80, experience: 60, education: 40, languages: 20 },
        { skills: 0, experience: 0, education: 0, languages: 0 }
      )
    ).toBe(50)
  })
})

describe('evaluateCandidate', () => {
  it('only suggests auto rejections; HR confirms them (council review)', () => {
    expect(evaluateCandidate(cand('a', analysis(flat(55))), job()).suggested).toBe(true)
    const confirmed = evaluateCandidate(
      cand('a', analysis(flat(55)), { hrDecision: 'reject', rejection: { reason: 'Below threshold (55 < 60) · confirmed by HR' } as never }),
      job({ threshold: 40 })
    )
    expect(confirmed).toMatchObject({ rejected: true, suggested: false, reason: 'Below threshold (55 < 60) · confirmed by HR' })
  })
  it('lets an HR decision outrank every auto rule', () => {
    const e = evaluateCandidate(cand('a', analysis(flat(90), 'not_met'), { hrDecision: 'shortlist' }), job())
    expect(e).toMatchObject({ rejected: false, suggested: false, note: 'Shortlisted by HR · Missing must-have: Finance degree' })
    expect(evaluateCandidate(cand('a', analysis(flat(50)), { hrDecision: 'maybe' }), job()).rejected).toBe(false)
  })
  it('rejects a missing must-have', () => {
    const e = evaluateCandidate(cand('a', analysis(flat(90), 'not_met')), job())
    expect(e.rejected).toBe(true)
    expect(e.reason).toBe('Missing must-have: Finance degree')
  })
  it('does not reject an unclear must-have', () => {
    expect(evaluateCandidate(cand('a', analysis(flat(90), 'unclear')), job()).rejected).toBe(false)
  })
  it('does not reject a missing nice-to-have', () => {
    expect(evaluateCandidate(cand('a', analysis(flat(90))), job()).rejected).toBe(false)
  })
  it('keeps a missing must-have when that toggle is off', () => {
    const e = evaluateCandidate(
      cand('a', analysis(flat(90), 'not_met')),
      job({ autoRejectMissingMustHave: false })
    )
    expect(e.rejected).toBe(false)
  })
  it('rejects below threshold', () => {
    const e = evaluateCandidate(cand('a', analysis(flat(55))), job())
    expect(e).toEqual({ score: 55, rejected: true, reason: 'Below threshold (55 < 60)', suggested: true, note: null })
  })
  it('keeps below-threshold candidates when that toggle is off', () => {
    const e = evaluateCandidate(cand('a', analysis(flat(55))), job({ autoRejectBelowThreshold: false }))
    expect(e.rejected).toBe(false)
  })
  it('never rejects a restored candidate', () => {
    const e = evaluateCandidate(cand('a', analysis(flat(10), 'not_met'), { restored: true }), job())
    expect(e.rejected).toBe(false)
  })
  it('rejects when HR rejects', () => {
    const e = evaluateCandidate(cand('a', analysis(flat(95)), { hrDecision: 'reject' }), job())
    expect(e.rejected).toBe(true)
    expect(e.reason).toBe('Rejected by HR')
  })
})

describe('rankCandidates', () => {
  it('sorts by score and splits rejected and pending', () => {
    const r = rankCandidates(
      [
        cand('low', analysis(flat(40))),
        cand('mid', analysis(flat(70))),
        cand('top', analysis(flat(90))),
        cand('wait'),
        cand('err', undefined, { status: 'error' })
      ],
      job()
    )
    expect(r.ranked.map((c) => c.id)).toEqual(['top', 'mid'])
    expect(r.rejected.map((c) => c.id)).toEqual(['low'])
    expect(r.pending.map((c) => c.id)).toEqual(['wait', 'err'])
  })
})
