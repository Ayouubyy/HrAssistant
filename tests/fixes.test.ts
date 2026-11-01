import { copyFileSync, mkdirSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ApiError } from '@google/genai'
import { describe, expect, it } from 'vitest'
import { createCache } from '../src/main/ai/cache'
import { translateError } from '../src/main/ai/gemini'
import { OfflineError, RetryableError, type AIProvider } from '../src/main/ai/provider'
import { redactContacts } from '../src/main/cv/prompts'
import { createPipeline } from '../src/main/cv/pipeline'
import { createSerialRunner } from '../src/main/inbox/runner'
import { toCsv } from '../src/main/csv'
import { createDb } from '../src/main/store/db'
import type { Candidate, JobFilter } from '../src/shared/types'

describe('translateError', () => {
  it('turns a 429 into a friendly retryable error that honours retryDelay', () => {
    const body = JSON.stringify({
      error: { code: 429, message: 'Quota exceeded', details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }] }
    })
    const e = translateError(new ApiError({ message: body, status: 429 }))
    expect(e).toBeInstanceOf(RetryableError)
    expect((e as RetryableError).delayMs).toBe(7000)
    expect((e as Error).message).not.toContain('{')
  })
  it('retries a reset connection', () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } })
    expect(translateError(err)).toBeInstanceOf(RetryableError)
  })
  it('reports offline when DNS fails', () => {
    const err = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } })
    expect(translateError(err)).toBeInstanceOf(OfflineError)
  })
})

describe('redactContacts', () => {
  it('keeps stacked experience dates', () => {
    const r = redactContacts('Experience\n2019 - 2022\n2016 - 2019\nPhone: +212 6 12 34 56 78')
    expect(r.text).toContain('2019 - 2022')
    expect(r.text).toContain('2016 - 2019')
    expect(r.phone).toBe('+212 6 12 34 56 78')
  })
})

const data = (p: string): string => join(__dirname, '..', 'test-data', p)
const job: JobFilter = {
  id: 'j1',
  title: 'T',
  description: 'd',
  preset: 'generic',
  requirements: [{ id: 'r1', text: 'Finance degree', mustHave: true }],
  weights: { skills: 1, experience: 1, education: 1, languages: 1 },
  threshold: 60,
  autoRejectMissingMustHave: true,
  autoRejectBelowThreshold: true,
  createdAt: ''
}

function setup(): { dir: string; db: ReturnType<typeof createDb>; calls: string[]; pipeline: ReturnType<typeof createPipeline> } {
  const dir = mkdtempSync(join(tmpdir(), 'hrf-'))
  const db = createDb(join(dir, 'db'))
  db.put('jobs', job)
  const calls: string[] = []
  const ai: AIProvider = {
    model: 'fake',
    json: async <T,>({ prompt }: { prompt: string }) => {
      calls.push(prompt)
      const requirements = [...prompt.matchAll(/^- \[([^\]]+)\]/gm)].map((m) => ({ requirementId: m[1], status: 'met', evidence: '' }))
      return { subScores: { skills: 50, experience: 50, education: 50, languages: 50 }, requirements, verdict: 'v' } as T
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
    onUpdate: () => {}
  })
  return { dir, db, calls, pipeline }
}

describe('pipeline fixes', () => {
  it('expands a dropped folder into its CVs', async () => {
    const { dir, db, pipeline } = setup()
    const folder = join(dir, 'drop')
    mkdirSync(join(folder, 'nested'), { recursive: true })
    copyFileSync(data('cvs/en-01-james-carter.docx'), join(folder, 'a.docx'))
    copyFileSync(data('cvs/fr-01-yasmine-alaoui.pdf'), join(folder, 'nested', 'b.pdf'))
    await pipeline.addFiles('j1', [folder], 'upload')
    await pipeline.idle()
    expect(db.list<Candidate>('candidates').map((c) => c.status)).toEqual(['done', 'done'])
  })
  it('re-screens a job after its requirements change', async () => {
    const { db, calls, pipeline } = setup()
    const p = join(mkdtempSync(join(tmpdir(), 'hrf-')), 'a.docx')
    copyFileSync(data('cvs/en-01-james-carter.docx'), p)
    await pipeline.addFiles('j1', [p], 'upload')
    await pipeline.idle()
    db.put('jobs', { ...job, requirements: [{ id: 'r9', text: 'French', mustHave: true }] })
    pipeline.reanalyzeJob('j1')
    await pipeline.idle()
    expect(calls).toHaveLength(2)
    expect(calls[1]).toContain('French')
    expect(db.list<Candidate>('candidates')[0].analysis?.requirements[0].requirementId).toBe('r9')
  })
})

describe('createSerialRunner', () => {
  it('runs again when asked while already running', async () => {
    let runs = 0
    let release!: () => void
    const run = createSerialRunner(async () => {
      runs++
      if (runs === 1) await new Promise<void>((r) => (release = r))
    })
    const first = run()
    const second = run()
    release()
    await Promise.all([first, second])
    expect(runs).toBe(2)
  })
})

describe('toCsv', () => {
  it('quotes, uses the separator and neutralises formulas', () => {
    expect(toCsv([['a;b', '=SUM(A1)', 'ok']], ';')).toBe('"a;b";\'=SUM(A1);ok')
  })
})
