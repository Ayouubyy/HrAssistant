import { describe, expect, it } from 'vitest'
import { askAssistant, detectLanguage } from '../src/main/assistant/chat'
import type { AIProvider } from '../src/main/ai/provider'
import type { Candidate, JobFilter } from '../src/shared/types'

const job: JobFilter = {
  id: 'j1',
  title: 'Credit analyst',
  description: 'desc',
  preset: 'banking',
  requirements: [{ id: 'r1', text: 'Finance degree', mustHave: true }],
  weights: { skills: 1, experience: 1, education: 1, languages: 1 },
  threshold: 60,
  autoRejectMissingMustHave: true,
  autoRejectBelowThreshold: true,
  createdAt: ''
}

const cand = (id: string, name: string, score: number): Candidate => ({
  id,
  jobId: 'j1',
  fileName: `${name}.pdf`,
  filePath: '',
  fileHash: id,
  source: 'upload',
  status: 'done',
  hrDecision: null,
  restored: false,
  revealed: false,
  analysis: {
    identity: { name, email: `${name}@x.com`, phone: null },
    yearsExperience: 4,
    languages: ['French'],
    subScores: { skills: score, experience: score, education: score, languages: score },
    requirements: [{ requirementId: 'r1', status: 'met', evidence: 'MSc Finance' }],
    matchedSkills: ['IFRS'],
    missingSkills: [],
    redFlags: [],
    verdict: 'ok'
  }
})

function fake(reply: unknown): AIProvider & { seen: string[] } {
  const seen: string[] = []
  return {
    model: 'fake',
    seen,
    json: async <T,>({ system, prompt }: { system: string; prompt: string }) => {
      seen.push(system + prompt)
      return reply as T
    },
    text: async () => ''
  }
}

describe('detectLanguage', () => {
  it('detects the three languages', () => {
    expect(detectLanguage('Show only candidates with 5 years')).toBe('English')
    expect(detectLanguage('Quels candidats ont plus de 5 ans ?')).toBe('French')
    expect(detectLanguage('من هو أفضل مرشح؟')).toBe('Arabic')
  })
})

describe('askAssistant', () => {
  it('never sends candidate names or emails, and uses Candidate N labels', async () => {
    const ai = fake({ answer: 'ok' })
    await askAssistant(ai, { kind: 'job', job, candidates: [cand('a', 'Yasmine Alaoui', 90), cand('b', 'Omar Tazi', 70)] }, [
      { role: 'user', content: 'Who is best?' }
    ])
    expect(ai.seen[0]).not.toContain('Yasmine')
    expect(ai.seen[0]).not.toContain('Omar Tazi')
    expect(ai.seen[0]).not.toContain('@x.com')
    expect(ai.seen[0]).not.toContain('.pdf')
    expect(ai.seen[0]).toContain('Candidate 1')
    expect(ai.seen[0]).toContain('Candidate 2')
  })

  it('maps a returned candidate filter to candidate ids', async () => {
    const ai = fake({ answer: 'Here they are', filter: { label: 'Top', candidates: ['Candidate 2'] } })
    const r = await askAssistant(ai, { kind: 'job', job, candidates: [cand('a', 'A', 90), cand('b', 'B', 70)] }, [
      { role: 'user', content: 'show B' }
    ])
    expect(r.answer).toBe('Here they are')
    expect(r.filter).toEqual({ label: 'Top', ids: ['b'] })
  })

  it('drops an empty filter', async () => {
    const ai = fake({ answer: 'Hi', filter: { label: '' } })
    const r = await askAssistant(ai, { kind: 'none' }, [{ role: 'user', content: 'hello' }])
    expect(r.filter).toBeUndefined()
  })
})
