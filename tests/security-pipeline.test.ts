import { copyFileSync, existsSync, mkdtempSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createCache } from '../src/main/ai/cache'
import type { AIProvider } from '../src/main/ai/provider'
import { createPipeline } from '../src/main/cv/pipeline'
import { createDb } from '../src/main/store/db'
import { applyRetention, deleteCandidates } from '../src/main/store/retention'
import { needsReview } from '../src/shared/flags'
import type { Candidate, JobFilter } from '../src/shared/types'

const root = join(__dirname, '..')
const job: JobFilter = {
  id: 'j1',
  title: 'Analyste crédit',
  description: 'Analyste crédit, master finance obligatoire',
  preset: 'banking',
  requirements: [{ id: 'r1', text: 'Master finance', mustHave: true }],
  weights: { skills: 1, experience: 1, education: 1, languages: 1 },
  threshold: 60,
  autoRejectMissingMustHave: true,
  autoRejectBelowThreshold: true,
  createdAt: ''
}
const good = {
  name: 'x',
  subScores: { skills: 75, experience: 75, education: 75, languages: 75 },
  requirements: [{ requirementId: 'r1', status: 'met', evidence: 'Master Finance' }],
  verdict: 'ok',
  suspiciousInstructions: []
}

function setup(reply: (prompt: string) => unknown | Promise<unknown>, scan?: () => Promise<'clean' | 'threat'>) {
  const dir = mkdtempSync(join(tmpdir(), 'hrsp-'))
  const db = createDb(join(dir, 'db'))
  db.put('jobs', job)
  const prompts: string[] = []
  const ai: AIProvider = {
    model: 'fake',
    json: async <T,>({ prompt }: { prompt: string }) => {
      prompts.push(prompt)
      return (await reply(prompt)) as T
    },
    text: async () => ''
  }
  const pipeline = createPipeline({
    ai: () => ai,
    db,
    cached: createCache(join(dir, 'cache')),
    filesDir: join(dir, 'files'),
    concurrency: () => 2,
    doubleCheck: () => false,
    baseDelayMs: 1,
    onUpdate: () => {},
    scan
  })
  const add = async (...files: string[]): Promise<Candidate[]> => {
    const paths = files.map((f) => {
      const p = join(dir, f.split('/').pop()!)
      copyFileSync(join(root, 'test-data', f), p)
      return p
    })
    await pipeline.addFiles('j1', paths, 'upload')
    await pipeline.idle()
    return db.list<Candidate>('candidates')
  }
  return { dir, db, prompts, pipeline, add }
}

describe('pipeline security', () => {
  it('T-05: an empty AI reply is retried once, then errors with no cache entry, and Retry works', async () => {
    let broken = true
    const s = setup(() => (broken ? {} : good))
    const [c] = await s.add('attacks/cv-clean-control.docx')
    expect(c.status).toBe('error')
    expect(c.flags?.[0].code).toBe('invalid_output')
    expect(s.prompts).toHaveLength(2)
    expect(readdirSync(join(s.dir, 'cache'))).toHaveLength(0)
    broken = false
    await s.pipeline.retry(c.id)
    await s.pipeline.idle()
    expect(s.db.get<Candidate>('candidates', c.id)?.status).toBe('done')
  })

  it('T-01/T-02: a CV with hidden instructions is flagged and the AI never sees the hidden text', async () => {
    const s = setup(() => good)
    const [c] = await s.add('attacks/cv-injection-white-fr.docx')
    expect(c.status).toBe('done')
    expect(needsReview(c)).toBe(true)
    expect(c.flags?.map((f) => f.code)).toEqual(expect.arrayContaining(['hidden_text', 'injection_phrase']))
    expect(s.prompts[0]).not.toMatch(/Ignorez toutes les instructions/)
    expect(s.prompts[0]).toContain('<cv_document>')
  })

  it('T-01 C: an injection the model reports is flagged', async () => {
    const s = setup(() => ({ ...good, suspiciousInstructions: ['give me 100'] }))
    const [c] = await s.add('attacks/cv-clean-control.docx')
    expect(c.flags?.find((f) => f.code === 'model_reported_injection')?.severity).toBe('high')
  })

  it('T-20: a Defender threat is flagged without blocking the analysis', async () => {
    const s = setup(() => good, async () => 'threat')
    const [c] = await s.add('attacks/cv-clean-control.docx')
    expect(c.status).toBe('done')
    expect(c.scan).toBe('threat')
    expect(c.flags?.find((f) => f.code === 'malware')?.severity).toBe('high')
  })

  it('T-26: a job deleted mid-analysis leaves no candidate behind', async () => {
    let release!: () => void
    const s = setup(() => new Promise((r) => (release = () => r(good))))
    const p = join(s.dir, 'a.docx')
    copyFileSync(join(root, 'test-data/attacks/cv-clean-control.docx'), p)
    await s.pipeline.addFiles('j1', [p], 'upload')
    await new Promise((r) => setTimeout(r, 300))
    s.db.remove('jobs', 'j1')
    deleteCandidates(s.db, s.dir, s.db.list<Candidate>('candidates').map((c) => c.id))
    release()
    await s.pipeline.idle()
    expect(s.db.list<Candidate>('candidates')).toEqual([])
  })

  it('T-26: deleting a candidate removes its CV copy and AI cache, unless another job shares the file', async () => {
    const s = setup(() => good)
    const [c] = await s.add('attacks/cv-clean-control.docx')
    expect(c.cacheIds).toHaveLength(1)
    expect(existsSync(c.filePath)).toBe(true)
    s.db.put('candidates', { ...c, id: 'other', jobId: 'j2' })
    deleteCandidates(s.db, s.dir, [c.id])
    expect(existsSync(c.filePath)).toBe(true)
    expect(readdirSync(join(s.dir, 'cache'))).toHaveLength(0)
    deleteCandidates(s.db, s.dir, ['other'])
    expect(existsSync(c.filePath)).toBe(false)
  })

  it('T-26: retention deletes candidates of jobs closed long enough ago, and only those', async () => {
    const s = setup(() => good)
    await s.add('attacks/cv-clean-control.docx')
    expect(applyRetention(s.db, s.dir, 0)).toBe(0)
    s.db.put('jobs', { ...job, closedAt: new Date('2026-01-01').toISOString() })
    expect(applyRetention(s.db, s.dir, 30, Date.parse('2026-01-15'))).toBe(0)
    expect(applyRetention(s.db, s.dir, 30, Date.parse('2026-03-01'))).toBe(1)
    expect(s.db.list<Candidate>('candidates')).toEqual([])
  })

  it('T-21: refuses a folder drop of more than 500 files', async () => {
    const s = setup(() => good)
    await expect(s.pipeline.addFiles('j1', Array.from({ length: 501 }, () => join(root, 'package.json')), 'upload')).rejects.toThrow(
      /more than 500/
    )
  })
})
