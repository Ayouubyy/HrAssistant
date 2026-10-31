import { randomUUID } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'fs'
import { basename, extname, join } from 'path'
import { weightedScore } from '../../shared/scoring'
import type { Candidate, CandidateAnalysis, JobFilter } from '../../shared/types'
import { cacheKey, sha256, type Cached } from '../ai/cache'
import { withRetry as retry, type AIProvider } from '../ai/provider'
import type { Db } from '../store/db'
import { analyzeCv, CV_PROMPT_VERSION } from './prompts'
import { extractText, SUPPORTED } from './extract'

export interface PipelineDeps {
  ai: () => AIProvider
  db: Db
  cached: Cached
  filesDir: string
  concurrency: () => number
  doubleCheck: () => boolean
  onUpdate: (c: Candidate) => void
  maxRetries?: number
  baseDelayMs?: number
}

// Folders are expanded recursively and keep only CV files; files picked directly are kept as-is
// so an unsupported one still shows up with an error.
function expandPaths(paths: string[], insideFolder = false): string[] {
  const out: string[] = []
  for (const p of paths) {
    try {
      if (statSync(p).isDirectory()) out.push(...expandPaths(readdirSync(p).map((f) => join(p, f)), true))
      else if (!insideFolder || SUPPORTED.includes(extname(p).toLowerCase())) out.push(p)
    } catch {
      // unreadable path: skip it
    }
  }
  return out
}

function averageAnalyses(a: CandidateAnalysis, b: CandidateAnalysis): CandidateAnalysis {
  const avg = (x: number, y: number): number => Math.round((x + y) / 2)
  return {
    ...a,
    subScores: {
      skills: avg(a.subScores.skills, b.subScores.skills),
      experience: avg(a.subScores.experience, b.subScores.experience),
      education: avg(a.subScores.education, b.subScores.education),
      languages: avg(a.subScores.languages, b.subScores.languages)
    }
  }
}

export function createPipeline(deps: PipelineDeps): {
  addFiles: (jobId: string, paths: string[], source: Candidate['source']) => Promise<Candidate[]>
  retry: (candidateId: string) => Promise<void>
  reanalyzeJob: (jobId: string) => void
  idle: () => Promise<void>
} {
  const { db, cached, filesDir, onUpdate, maxRetries = 4, baseDelayMs = 2000 } = deps
  mkdirSync(filesDir, { recursive: true })

  const queue: string[] = []
  let running = 0
  let idleWaiters: (() => void)[] = []

  const save = (c: Candidate): Candidate => {
    db.put('candidates', c)
    onUpdate(c)
    return c
  }

  const withRetry = <T,>(fn: () => Promise<T>): Promise<T> => retry(fn, maxRetries, baseDelayMs)

  async function process(id: string): Promise<void> {
    const c = db.get<Candidate>('candidates', id)
    const job = c && db.get<JobFilter>('jobs', c.jobId)
    if (!c || !job) return
    save({ ...c, status: 'processing', error: undefined })
    try {
      const { text, hash } = await extractText(c.filePath)
      const ai = deps.ai()
      const base = [hash, sha256(job.description), JSON.stringify(job.requirements), job.preset, CV_PROMPT_VERSION, ai.model]
      let analysis = await withRetry(() => cached(cacheKey(...base), () => analyzeCv(ai, job, text)))
      if (deps.doubleCheck() && Math.abs(weightedScore(analysis.subScores, job.weights) - job.threshold) <= 5) {
        const second = await withRetry(() => cached(cacheKey(...base, 'check'), () => analyzeCv(ai, job, text)))
        analysis = averageAnalyses(analysis, second)
      }
      save({ ...db.get<Candidate>('candidates', id)!, status: 'done', analysis, error: undefined })
    } catch (e) {
      save({ ...db.get<Candidate>('candidates', id)!, status: 'error', error: (e as Error).message })
    }
  }

  function pump(): void {
    while (running < Math.max(1, deps.concurrency()) && queue.length) {
      const id = queue.shift()!
      running++
      process(id).finally(() => {
        running--
        pump()
      })
    }
    if (running === 0 && queue.length === 0) {
      const w = idleWaiters
      idleWaiters = []
      w.forEach((r) => r())
    }
  }

  const enqueue = (id: string): void => {
    queue.push(id)
    pump()
  }

  // Resume anything interrupted by a restart.
  for (const c of db.list<Candidate>('candidates')) {
    if (c.status === 'pending' || c.status === 'processing') enqueue(c.id)
  }

  return {
    async addFiles(jobId, paths, source) {
      const existing = new Set(
        db
          .list<Candidate>('candidates')
          .filter((c) => c.jobId === jobId)
          .map((c) => c.fileHash)
      )
      const added: Candidate[] = []
      for (const p of expandPaths(paths)) {
        const ext = extname(p).toLowerCase()
        let bytes: Buffer
        try {
          bytes = readFileSync(p)
        } catch {
          continue
        }
        const hash = sha256(bytes)
        if (existing.has(hash)) continue
        existing.add(hash)
        const stored = join(filesDir, `${hash.slice(0, 16)}${ext}`)
        if (!existsSync(stored)) copyFileSync(p, stored)
        const c = save({
          id: randomUUID(),
          jobId,
          fileName: basename(p),
          filePath: stored,
          fileHash: hash,
          source,
          status: SUPPORTED.includes(ext) ? 'pending' : 'error',
          error: SUPPORTED.includes(ext) ? undefined : 'Unsupported file type. Use PDF or DOCX.',
          hrDecision: null,
          restored: false,
          revealed: false
        })
        added.push(c)
        if (c.status === 'pending') enqueue(c.id)
      }
      return added
    },
    async retry(id) {
      const c = db.get<Candidate>('candidates', id)
      if (!c) return
      save({ ...c, status: 'pending', error: undefined })
      enqueue(id)
    },
    reanalyzeJob(jobId) {
      for (const c of db.list<Candidate>('candidates')) {
        if (c.jobId !== jobId || c.status === 'pending' || c.status === 'processing') continue
        save({ ...c, status: 'pending', error: undefined })
        enqueue(c.id)
      }
    },
    idle: () =>
      running === 0 && queue.length === 0 ? Promise.resolve() : new Promise((r) => idleWaiters.push(r))
  }
}
