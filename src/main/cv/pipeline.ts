import { randomUUID } from 'crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { mergeFlags } from '../../shared/flags'
import { weightedScore } from '../../shared/scoring'
import type { Candidate, CandidateAnalysis, JobFilter, ReviewFlag } from '../../shared/types'
import { cacheId, cacheKey, sha256, type Cached } from '../ai/cache'
import { InvalidModelOutputError, withRetry as retry, type AIProvider } from '../ai/provider'
import { LIMITS } from '../security/active-content'
import { markOfTheWeb } from '../security/files'
import { scanInjection } from '../security/injection'
import { checkAnalysis, escalate, jdCopy, keywordStuffing, quotesCheckable } from '../security/output-checks'
import type { ScanResult } from '../security/defender'
import type { Db } from '../store/db'
import { aiText, analyzeCv, CV_PROMPT_VERSION } from './prompts'
import { extractText, SUPPORTED, UnsupportedFileError } from './extract'

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
  extractMs?: number
  scan?: (path: string) => Promise<ScanResult>
}

const malwareFlag = (scan: ScanResult): ReviewFlag[] =>
  scan === 'threat'
    ? [{ code: 'malware', severity: 'high', detail: 'Microsoft Defender found a threat in this file. Don’t open it.' }]
    : []

export class TooManyFilesError extends Error {
  constructor() {
    super(`That's more than ${LIMITS.filesPerDrop} files. Add them in smaller batches.`)
  }
}

// Folders are expanded recursively and keep only CV files; files picked directly are kept as-is
// so an unsupported one still shows up with an error. Symlinks and junctions are skipped.
function expandPaths(paths: string[], insideFolder = false, out: string[] = []): string[] {
  for (const p of paths) {
    try {
      const st = lstatSync(p)
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) expandPaths(readdirSync(p).map((f) => join(p, f)), true, out)
      else if (!insideFolder || SUPPORTED.includes(extname(p).toLowerCase())) out.push(p)
    } catch {
      // unreadable path: skip it
    }
    if (out.length > LIMITS.filesPerDrop) throw new TooManyFilesError()
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

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Reading this file took too long, so it was skipped.')), ms)
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e))
    )
  })
}

// A dismissal stays only while the high flags are the same ones HR dismissed.
const highCodes = (fs: ReviewFlag[] | undefined): string =>
  (fs ?? [])
    .filter((f) => f.severity === 'high')
    .map((f) => f.code)
    .sort()
    .join(',')

export function createPipeline(deps: PipelineDeps): {
  addFiles: (jobId: string, paths: string[], source: Candidate['source']) => Promise<Candidate[]>
  retry: (candidateId: string) => Promise<void>
  reanalyzeJob: (jobId: string) => void
  idle: () => Promise<void>
} {
  const { db, cached, filesDir, onUpdate, maxRetries = 4, baseDelayMs = 2000, extractMs = LIMITS.extractMs } = deps
  mkdirSync(filesDir, { recursive: true })

  const queue: string[] = []
  let running = 0
  let idleWaiters: (() => void)[] = []

  const save = (c: Candidate): Candidate => {
    db.put('candidates', c)
    onUpdate(c)
    return c
  }
  // The candidate may have been deleted (with its job) while it was being analyzed.
  const saveIfExists = (id: string, patch: Partial<Candidate>): void => {
    const cur = db.get<Candidate>('candidates', id)
    if (cur && db.get<JobFilter>('jobs', cur.jobId)) save({ ...cur, ...patch, id })
  }

  const withRetry = <T,>(fn: () => Promise<T>): Promise<T> => retry(fn, maxRetries, baseDelayMs)

  async function process(id: string): Promise<void> {
    const c = db.get<Candidate>('candidates', id)
    const job = c && db.get<JobFilter>('jobs', c.jobId)
    if (!c || !job) return
    save({ ...c, status: 'processing', error: undefined })
    // The antivirus scan runs alongside the analysis and never blocks it.
    const scanning = c.scan && c.scan !== 'unavailable' ? Promise.resolve(c.scan) : (deps.scan?.(c.filePath) ?? Promise.resolve(undefined))
    try {
      const ex = await withTimeout(extractText(c.filePath), extractMs)
      const scan = await scanning
      const fileFlags = [...ex.flags, ...scanInjection(ex.fullText), ...(scan ? malwareFlag(scan) : [])]
      const ai = deps.ai()
      const base = [ex.hash, sha256(job.description), JSON.stringify(job.requirements), job.preset, CV_PROMPT_VERSION, ai.model]
      const cacheIds = [cacheId(cacheKey(...base))]
      let analysis = await withRetry(() => cached(cacheKey(...base), () => analyzeCv(ai, job, ex.text)))
      const flags: ReviewFlag[] = []
      if (deps.doubleCheck() && Math.abs(weightedScore(analysis.subScores, job.weights) - job.threshold) <= 5) {
        cacheIds.push(cacheId(cacheKey(...base, 'check')))
        const second = await withRetry(() => cached(cacheKey(...base, 'check'), () => analyzeCv(ai, job, ex.text)))
        const gap = Math.abs(weightedScore(analysis.subScores, job.weights) - weightedScore(second.subScores, job.weights))
        if (gap > 10)
          flags.push({ code: 'score_anomaly', severity: 'info', detail: `The AI is unsure about this one: two readings differ by ${gap} points.` })
        analysis = averageAnalyses(analysis, second)
      }
      const suspicious = analysis.suspiciousInstructions ?? []
      if (suspicious.length)
        flags.push({
          code: 'model_reported_injection',
          severity: 'high',
          detail: 'The AI reported text in this CV that tries to instruct it. It was told to ignore it.',
          evidence: suspicious.join(' · ').slice(0, 120)
        })
      const injected = suspicious.length > 0 || fileFlags.some((f) => f.severity === 'high' && f.code !== 'active_content')
      flags.push(
        ...checkAnalysis(analysis, job, aiText(ex.text).text, injected, quotesCheckable(c.fileName, ex.text)),
        ...jdCopy(ex.text, job.description),
        ...keywordStuffing(ex.text, job)
      )
      const all = escalate(mergeFlags(fileFlags, flags), weightedScore(analysis.subScores, job.weights), job.threshold)
      const prev = db.get<Candidate>('candidates', id)
      saveIfExists(id, {
        status: 'done',
        analysis,
        error: undefined,
        flags: all,
        scan,
        cacheIds: [...new Set([...(prev?.cacheIds ?? []), ...cacheIds])],
        flagsDismissed: !!prev?.flagsDismissed && highCodes(prev.flags) === highCodes(all)
      })
    } catch (e) {
      const scan = await scanning.catch(() => undefined)
      const flags: ReviewFlag[] = [
        ...(scan ? malwareFlag(scan) : []),
        ...(e instanceof InvalidModelOutputError
          ? [{ code: 'invalid_output' as const, severity: 'warn' as const, detail: 'The AI returned an unusable answer twice. Retry, or check the CV yourself.' }]
          : [])
      ]
      saveIfExists(id, { status: 'error', error: (e as Error).message, flags: flags.length ? flags : undefined, scan })
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

  const newCandidate = (jobId: string, p: string, source: Candidate['source'], extra: Partial<Candidate>): Candidate => ({
    id: randomUUID(),
    jobId,
    fileName: basename(p),
    filePath: '',
    fileHash: '',
    source,
    status: 'pending',
    hrDecision: null,
    restored: false,
    revealed: false,
    ...extra
  })

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
          if (lstatSync(p).size > LIMITS.cvBytes) {
            added.push(
              save(
                newCandidate(jobId, p, source, {
                  fileHash: sha256(`${p}\u0000too-large`),
                  status: 'error',
                  error: `This CV is larger than ${LIMITS.cvBytes / 1024 / 1024} MB, so it wasn't opened.`
                })
              )
            )
            continue
          }
          bytes = readFileSync(p)
        } catch {
          continue
        }
        const hash = sha256(bytes)
        if (existing.has(hash)) continue
        existing.add(hash)
        const supported = SUPPORTED.includes(ext)
        const stored = join(filesDir, `${hash.slice(0, 16)}${supported ? ext : '.bin'}`)
        if (!existsSync(stored)) {
          copyFileSync(p, stored)
          markOfTheWeb(stored)
        }
        const c = save(
          newCandidate(jobId, p, source, {
            filePath: stored,
            fileHash: hash,
            status: supported ? 'pending' : 'error',
            error: supported ? undefined : new UnsupportedFileError(ext).message
          })
        )
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
        if (c.jobId !== jobId || c.status === 'pending' || c.status === 'processing' || !c.filePath) continue
        save({ ...c, status: 'pending', error: undefined })
        enqueue(c.id)
      }
    },
    idle: () =>
      running === 0 && queue.length === 0 ? Promise.resolve() : new Promise((r) => idleWaiters.push(r))
  }
}
