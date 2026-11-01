import { copyFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createCache } from '../src/main/ai/cache'
import type { AIProvider } from '../src/main/ai/provider'
import { InvalidModelOutputError, RetryableError } from '../src/main/ai/provider'
import { analyzeCv, jobLanguage, normalizeAnalysis, redactContacts } from '../src/main/cv/prompts'
import { createPipeline } from '../src/main/cv/pipeline'
import { createDb } from '../src/main/store/db'
import type { Candidate, JobFilter } from '../src/shared/types'

const data = (p: string): string => join(__dirname, '..', 'test-data', p)
const tmp = (): string => mkdtempSync(join(tmpdir(), 'hrp-'))

const job: JobFilter = {
  id: 'j1',
  title: 'Credit analyst',
  description: 'Credit analyst, finance degree required',
  preset: 'banking',
  requirements: [{ id: 'r1', text: 'Finance degree', mustHave: true }],
  weights: { skills: 1, experience: 1, education: 1, languages: 1 },
  threshold: 60,
  autoRejectMissingMustHave: true,
  autoRejectBelowThreshold: true,
  createdAt: ''
}

const goodRaw = {
  name: 'Someone',
  yearsExperience: 5,
  languages: ['French'],
  subScores: { skills: 80, experience: 70, education: 90, languages: 60 },
  requirements: [{ requirementId: 'r1', status: 'met', evidence: 'Master Finance' }],
  matchedSkills: ['IFRS'],
  missingSkills: [],
  redFlags: [],
  verdict: 'Good fit'
}

function fakeAi(json: (prompt: string) => Promise<unknown>): AIProvider & { prompts: string[] } {
  const prompts: string[] = []
  return {
    model: 'fake',
    prompts,
    json: async <T,>({ prompt }: { prompt: string }) => {
      prompts.push(prompt)
      return (await json(prompt)) as T
    },
    text: async () => ''
  }
}

function setup(ai: AIProvider, files: string[]): {
  run: (paths?: string[]) => Promise<Candidate[]>
  pipeline: ReturnType<typeof createPipeline>
} {
  const dir = tmp()
  const db = createDb(join(dir, 'db'))
  db.put('jobs', job)
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
  const paths = files.map((f) => {
    const p = join(dir, f.split('/').pop()!)
    copyFileSync(data(f), p)
    return p
  })
  return {
    pipeline,
    run: async (ps = paths) => {
      await pipeline.addFiles('j1', ps, 'upload')
      await pipeline.idle()
      return db.list<Candidate>('candidates')
    }
  }
}

const THREE = ['cvs/en-01-james-carter.docx', 'cvs/fr-02-mehdi-bennani.docx', 'cvs/fr-01-yasmine-alaoui.pdf']

describe('pipeline', () => {
  it('analyzes every file', async () => {
    const { run } = setup(fakeAi(async () => goodRaw), THREE)
    const cs = await run()
    expect(cs).toHaveLength(3)
    expect(cs.every((c) => c.status === 'done')).toBe(true)
    expect(cs[0].analysis?.subScores.education).toBe(90)
  })

  it('does not add the same CV twice to a job', async () => {
    const { run } = setup(fakeAi(async () => goodRaw), ['cvs/en-01-james-carter.docx'])
    const first = await run()
    const again = await run([first[0].filePath])
    expect(again).toHaveLength(1)
  })

  it('retries rate-limit errors and then succeeds', async () => {
    let calls = 0
    const { run } = setup(
      fakeAi(async () => {
        if (++calls <= 2) throw new RetryableError('429')
        return goodRaw
      }),
      ['cvs/en-01-james-carter.docx']
    )
    const [c] = await run()
    expect(c.status).toBe('done')
    expect(calls).toBe(3)
  })

  it('gives up on one CV after 4 retries without blocking the others', async () => {
    const { run } = setup(
      fakeAi(async (prompt) => {
        if (prompt.includes('James Carter') || prompt.includes('Credit Risk Analyst')) throw new RetryableError('429')
        return goodRaw
      }),
      THREE
    )
    const cs = await run()
    const failed = cs.filter((c) => c.status === 'error')
    expect(failed).toHaveLength(1)
    expect(failed[0].fileName).toBe('en-01-james-carter.docx')
    expect(cs.filter((c) => c.status === 'done')).toHaveLength(2)
  })

  it('marks an unreadable file as an error', async () => {
    const { run } = setup(fakeAi(async () => goodRaw), ['blank.pdf'])
    const [c] = await run()
    expect(c.status).toBe('error')
    expect(c.error).toBe("Couldn't read text from this file")
  })

  it('retry() re-runs a failed candidate', async () => {
    let fail = true
    const { run, pipeline } = setup(
      fakeAi(async () => {
        if (fail) throw new Error('boom')
        return goodRaw
      }),
      ['cvs/en-01-james-carter.docx']
    )
    const [c] = await run()
    expect(c.status).toBe('error')
    fail = false
    await pipeline.retry(c.id)
    await pipeline.idle()
    expect((await run([]))[0].status).toBe('done')
  })

  it('does not send email addresses or phone numbers to the AI', async () => {
    const ai = fakeAi(async () => goodRaw)
    const { run } = setup(ai, ['cvs/en-01-james-carter.docx'])
    const [c] = await run()
    expect(ai.prompts[0]).not.toContain('james.carter@mail.co.uk')
    expect(ai.prompts[0]).not.toContain('7700 900123')
    expect(c.analysis?.identity.email).toBe('james.carter@mail.co.uk')
  })

  it('does not send the candidate name to the AI, and keeps it for HR', async () => {
    const ai = fakeAi(async () => goodRaw)
    const { run } = setup(ai, ['cvs/en-01-james-carter.docx', 'cvs/ar-01-khalid-amrani.docx'])
    const list = await run()
    expect(ai.prompts.join('\n')).not.toMatch(/James Carter|خالد العمراني/)
    expect(ai.prompts[0]).toContain('[name]')
    expect(list.map((c) => c.analysis?.identity.name).sort()).toEqual(['James Carter', 'خالد العمراني'].sort())
  })
})

describe('normalizeAnalysis', () => {
  it('refuses incomplete model output instead of inventing a low score', () => {
    const none = { email: null, phone: null }
    expect(() => normalizeAnalysis({}, job, none)).toThrow(InvalidModelOutputError)
    expect(() => normalizeAnalysis({ subScores: { skills: 'high', experience: 140 }, requirements: 'x' }, job, none)).toThrow(
      InvalidModelOutputError
    )
    const noReqs = { ...goodRaw, requirements: [] }
    expect(() => normalizeAnalysis(noReqs, job, none)).toThrow(InvalidModelOutputError)
  })
  it('clamps scores and fills cosmetic fields', () => {
    const a = normalizeAnalysis(
      { subScores: { skills: 140, experience: '70', education: -5, languages: 60 }, requirements: [{ requirementId: 'r1', status: 'odd' }] },
      job,
      { email: null, phone: null }
    )
    expect(a.subScores).toEqual({ skills: 100, experience: 70, education: 0, languages: 60 })
    expect(a.matchedSkills).toEqual([])
    expect(a.requirements).toEqual([{ requirementId: 'r1', status: 'unclear', evidence: '' }])
    expect(a.verdict).toBe('')
  })
})

describe('redactContacts', () => {
  it('removes emails and phone numbers', () => {
    const r = redactContacts('Call +212 6 12 34 56 78 or 0612131415, mail a.b@c.ma. Born 2015-2017.')
    expect(r.text).not.toMatch(/a\.b@c\.ma|0612131415|12 34 56 78/)
    expect(r.text).toContain('2015-2017')
    expect(r.email).toBe('a.b@c.ma')
    expect(r.phone).toBe('+212 6 12 34 56 78')
  })
})

describe('verdict language', () => {
  it('names the job description language in the prompt', async () => {
    expect(jobLanguage('We are looking for a software engineer with experience in SQL and APIs.')).toBe('English')
    expect(jobLanguage('Nous recherchons un analyste crédit avec une expérience de 3 ans et la maîtrise des normes IFRS 9.')).toBe('French')
    expect(jobLanguage('نبحث عن محلل ائتمان لديه خبرة في التحليل المالي')).toBe('Arabic')
    let system = ''
    const ai: AIProvider = {
      model: 'fake',
      json: async <T,>(o: { system: string }) => ((system = o.system), goodRaw as T),
      text: async () => ''
    }
    await analyzeCv(ai, { ...job, description: 'We need a credit analyst with a finance degree and experience in risk.' }, 'x'.repeat(300))
    expect(system).toContain('in English, whatever language the CV is written in')
  })
})
