import { randomUUID } from 'crypto'
import { app, dialog, shell } from 'electron'
import { readFileSync, statSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import mammoth from 'mammoth'
import { rankCandidates } from '../shared/scoring'
import type { Candidate, EmailItem, JobFilter, PresetId } from '../shared/types'
import { createCache } from './ai/cache'
import { GeminiProvider } from './ai/gemini'
import { NoApiKeyError, withRetry, type AIProvider } from './ai/provider'
import { csvSeparator, toCsv } from './csv'
import { askAssistant, type ChatContext } from './assistant/chat'
import { extractRequirements } from './cv/prompts'
import { createPipeline } from './cv/pipeline'
import { extractText } from './cv/extract'
import { push, type Ctx } from './ipc'
import { checkSize, LIMITS } from './security/active-content'
import { defenderScan } from './security/defender'
import {
  assertId,
  assertPreset,
  assertString,
  validateCandidatePatch,
  validateHistory,
  validateJob,
  validatePaths,
  validateRef
} from './security/validate'
import { deleteCandidates } from './store/retention'
import { getGeminiKey } from './store/secrets'
import { getSettings } from './store/settings'

export function getProvider(): AIProvider {
  const key = getGeminiKey()
  if (!key) throw new NoApiKeyError()
  return new GeminiProvider(key, getSettings().model)
}

export function createServices(ctx: Ctx): {
  cached: ReturnType<typeof createCache>
  pipeline: ReturnType<typeof createPipeline>
} {
  const cached = createCache(join(ctx.dataDir, 'cache'))
  const pipeline = createPipeline({
    ai: getProvider,
    db: ctx.db,
    cached,
    filesDir: join(ctx.dataDir, 'files'),
    concurrency: () => getSettings().concurrency,
    doubleCheck: () => getSettings().doubleCheck,
    onUpdate: (c) => push(ctx, 'candidates:updated', c),
    scan: defenderScan
  })
  return { cached, pipeline }
}

async function readJobFile(path: string): Promise<string> {
  checkSize(statSync(path).size, LIMITS.cvBytes, 'file')
  const ext = extname(path).toLowerCase()
  if (ext === '.docx') return (await mammoth.extractRawText({ path })).value
  if (ext === '.pdf') return (await extractText(path)).text
  return readFileSync(path, 'utf8')
}

export function jobHandlers(ctx: Ctx, services: ReturnType<typeof createServices>): Record<string, (...a: never[]) => unknown> {
  const { db } = ctx
  const { pipeline, cached } = services
  const candidate = (id: string): Candidate => {
    assertId(id)
    const c = db.get<Candidate>('candidates', id)
    if (!c) throw new Error('Candidate not found.')
    return c
  }
  return {
    'jobs:list': () => db.list<JobFilter>('jobs').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    'jobs:get': (id: string) => (assertId(id), db.get<JobFilter>('jobs', id)),
    'jobs:save': (input: JobFilter) => {
      const job = validateJob(input)
      const old = job.id ? db.get<JobFilter>('jobs', job.id) : null
      const saved = db.put('jobs', { ...job, id: job.id || randomUUID(), createdAt: job.createdAt || new Date().toISOString() })
      const screeningChanged =
        old &&
        (old.description !== saved.description ||
          old.preset !== saved.preset ||
          JSON.stringify(old.requirements) !== JSON.stringify(saved.requirements))
      if (screeningChanged) pipeline.reanalyzeJob(saved.id)
      push(ctx, 'jobs:changed', null)
      return saved
    },
    'jobs:delete': (id: string) => {
      assertId(id)
      db.remove('jobs', id)
      deleteCandidates(
        db,
        ctx.dataDir,
        db
          .list<Candidate>('candidates')
          .filter((c) => c.jobId === id)
          .map((c) => c.id)
      )
      push(ctx, 'jobs:changed', null)
    },
    // Runs every CV of a job through the current prompt again (after a prompt or model change).
    'jobs:rescreen': (id: string) => {
      assertId(id)
      if (!db.get<JobFilter>('jobs', id)) throw new Error('Job filter not found.')
      pipeline.reanalyzeJob(id)
    },
    'jobs:extractRequirements': async (description: string, preset: PresetId) => {
      assertString(description, 100_000)
      assertPreset(preset)
      const ai = getProvider()
      return withRetry(() =>
        cached(`req\u0000${description}\u0000${preset}\u0000${ai.model}`, () => extractRequirements(ai, description, preset))
      )
    },
    'jobs:loadDescriptionFile': async () => {
      const r = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Job description', extensions: ['txt', 'docx', 'pdf', 'md'] }]
      })
      return r.canceled ? null : readJobFile(r.filePaths[0])
    },
    'assistant:ask': async (ref: unknown, history: unknown) => {
      const r = validateRef(ref)
      const h = validateHistory(history)
      let chat: ChatContext = { kind: 'none' }
      if (r.kind === 'job') {
        const job = db.get<JobFilter>('jobs', r.jobId)
        if (job) chat = { kind: 'job', job, candidates: db.list<Candidate>('candidates').filter((c) => c.jobId === job.id) }
      } else if (r.kind === 'email') {
        const email = db.get<EmailItem>('emails', r.emailId)
        if (email) chat = { kind: 'email', email }
      }
      const ai = getProvider()
      const reply = await withRetry(() => askAssistant(ai, chat, h.slice(-12), getSettings().policyText), 2)
      return { ...reply, jobId: r.kind === 'job' ? r.jobId : undefined }
    },
    'candidates:list': (jobId: string) => (assertId(jobId), db.list<Candidate>('candidates').filter((c) => c.jobId === jobId)),
    'candidates:counts': () => {
      const counts: Record<string, number> = {}
      for (const c of db.list<Candidate>('candidates')) counts[c.jobId] = (counts[c.jobId] ?? 0) + 1
      return counts
    },
    'candidates:pickFiles': async () => {
      const r = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [{ name: 'CVs', extensions: ['pdf', 'docx'] }]
      })
      return r.canceled ? [] : r.filePaths
    },
    'candidates:add': (jobId: string, paths: unknown) => {
      assertId(jobId)
      if (!db.get<JobFilter>('jobs', jobId)) throw new Error('Job filter not found.')
      return pipeline.addFiles(jobId, validatePaths(paths), 'upload')
    },
    'candidates:update': (id: string, patch: unknown) => {
      const c = candidate(id)
      const next = db.put('candidates', { ...c, ...validateCandidatePatch(patch), id })
      push(ctx, 'candidates:updated', next)
      return next
    },
    'candidates:delete': (id: string) => {
      const c = candidate(id)
      deleteCandidates(db, ctx.dataDir, [id])
      push(ctx, 'candidates:removed', { id, jobId: c.jobId })
    },
    'candidates:retry': (id: string) => pipeline.retry(candidate(id).id),
    'candidates:open': async (id: string) => {
      const c = candidate(id)
      if (!c.filePath || !['.pdf', '.docx'].includes(extname(c.filePath).toLowerCase()))
        throw new Error("This file type can't be opened from HR Assistant.")
      if (c.flags?.some((f) => f.code === 'active_content' && f.severity === 'high')) {
        const r = await dialog.showMessageBox({
          type: 'warning',
          buttons: ['Open anyway', 'Cancel'],
          defaultId: 1,
          cancelId: 1,
          title: 'Open CV',
          message: 'This CV contains active content (scripts, macros or embedded files).',
          detail: 'Normal CVs don’t. Open it only if you trust where it came from.'
        })
        if (r.response !== 0) return
      }
      await shell.openPath(c.filePath)
    },
    'candidates:exportCsv': async (jobId: string) => {
      assertId(jobId)
      const job = db.get<JobFilter>('jobs', jobId)
      if (!job) return false
      const r = await dialog.showSaveDialog({
        defaultPath: `${job.title.replace(/[\\/:*?"<>|]/g, '')} - shortlist.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }]
      })
      if (r.canceled || !r.filePath) return false
      const { ranked, rejected } = rankCandidates(
        db.list<Candidate>('candidates').filter((c) => c.jobId === jobId),
        job
      )
      const header = ['Rank', 'Name', 'Email', 'Score', 'Status', 'HR decision', 'Verdict', 'Missing must-haves', 'Security flags']
      const lines = [...ranked, ...rejected].map((c, i) => {
        const missing = job.requirements
          .filter((q) => q.mustHave && c.analysis?.requirements.some((x) => x.requirementId === q.id && x.status === 'not_met'))
          .map((q) => q.text)
          .join(' / ')
        return [
          c.rejected ? '' : i + 1,
          c.analysis?.identity.name ?? c.fileName,
          c.analysis?.identity.email ?? '',
          c.score,
          c.rejected ? `Rejected: ${c.reason}` : 'Kept',
          c.hrDecision ?? '',
          c.analysis?.verdict ?? '',
          missing,
          c.flagsDismissed ? '' : (c.flags ?? []).filter((f) => f.severity === 'high').map((f) => f.detail).join(' / ')
        ]
      })
      writeFileSync(r.filePath, '\ufeff' + toCsv([header, ...lines], csvSeparator(app.getSystemLocale())))
      return true
    }
  }
}
