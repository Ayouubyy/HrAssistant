import { randomUUID } from 'crypto'
import { dialog, shell } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import mammoth from 'mammoth'
import { rankCandidates } from '../shared/scoring'
import type { Candidate, JobFilter, PresetId } from '../shared/types'
import { createCache } from './ai/cache'
import { GeminiProvider } from './ai/gemini'
import { NoApiKeyError, type AIProvider } from './ai/provider'
import { extractRequirements } from './cv/prompts'
import { createPipeline } from './cv/pipeline'
import { extractText } from './cv/extract'
import { push, type Ctx } from './ipc'
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
    onUpdate: (c) => push(ctx, 'candidates:updated', c)
  })
  return { cached, pipeline }
}

function csvCell(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function readJobFile(path: string): Promise<string> {
  const ext = extname(path).toLowerCase()
  if (ext === '.docx') return (await mammoth.extractRawText({ path })).value
  if (ext === '.pdf') return (await extractText(path)).text
  return readFileSync(path, 'utf8')
}

export function jobHandlers(ctx: Ctx, services: ReturnType<typeof createServices>): Record<string, (...a: never[]) => unknown> {
  const { db } = ctx
  const { pipeline, cached } = services
  return {
    'jobs:list': () =>
      db.list<JobFilter>('jobs').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    'jobs:get': (id: string) => db.get<JobFilter>('jobs', id),
    'jobs:save': (job: JobFilter) => {
      const saved = db.put('jobs', { ...job, id: job.id || randomUUID(), createdAt: job.createdAt || new Date().toISOString() })
      push(ctx, 'jobs:changed', null)
      return saved
    },
    'jobs:delete': (id: string) => {
      db.remove('jobs', id)
      for (const c of db.list<Candidate>('candidates')) if (c.jobId === id) db.remove('candidates', c.id)
      push(ctx, 'jobs:changed', null)
    },
    'jobs:extractRequirements': async (description: string, preset: PresetId) => {
      const ai = getProvider()
      return cached(`req\u0000${description}\u0000${preset}\u0000${ai.model}`, () =>
        extractRequirements(ai, description, preset)
      )
    },
    'jobs:loadDescriptionFile': async () => {
      const r = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Job description', extensions: ['txt', 'docx', 'pdf', 'md'] }]
      })
      return r.canceled ? null : readJobFile(r.filePaths[0])
    },
    'candidates:list': (jobId: string) => db.list<Candidate>('candidates').filter((c) => c.jobId === jobId),
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
    'candidates:add': (jobId: string, paths: string[]) => pipeline.addFiles(jobId, paths, 'upload'),
    'candidates:update': (id: string, patch: Partial<Candidate>) => {
      const c = db.get<Candidate>('candidates', id)
      if (!c) return null
      const next = db.put('candidates', { ...c, ...patch, id })
      push(ctx, 'candidates:updated', next)
      return next
    },
    'candidates:retry': (id: string) => pipeline.retry(id),
    'candidates:open': (id: string) => {
      const c = db.get<Candidate>('candidates', id)
      if (c) void shell.openPath(c.filePath)
    },
    'candidates:exportCsv': async (jobId: string) => {
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
      const header = ['Rank', 'Name', 'Email', 'Score', 'Status', 'HR decision', 'Verdict', 'Missing must-haves']
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
          missing
        ]
          .map(csvCell)
          .join(',')
      })
      writeFileSync(r.filePath, '﻿' + [header.join(','), ...lines].join('\r\n'))
      return true
    }
  }
}
