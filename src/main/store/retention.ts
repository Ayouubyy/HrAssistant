import { rmSync } from 'fs'
import { join } from 'path'
import type { Candidate, JobFilter } from '../../shared/types'
import { removeCached } from '../ai/cache'
import type { Db } from './db'

// Removes candidates with their AI cache entries and their CV copy (unless another job uses the same file).
export function deleteCandidates(db: Db, dataDir: string, ids: string[]): void {
  const gone = new Set(ids)
  const doomed = db.list<Candidate>('candidates').filter((c) => gone.has(c.id))
  for (const c of doomed) db.remove('candidates', c.id)
  const stillUsed = new Set(db.list<Candidate>('candidates').map((c) => c.filePath))
  for (const c of doomed) {
    removeCached(join(dataDir, 'cache'), c.cacheIds ?? [])
    if (c.filePath && c.filePath.startsWith(join(dataDir, 'files')) && !stillUsed.has(c.filePath)) rmSync(c.filePath, { force: true })
  }
}

// Optional retention: candidates of jobs closed more than N days ago are deleted at startup (T-26).
export function applyRetention(db: Db, dataDir: string, days: number, now = Date.now()): number {
  if (days <= 0) return 0
  const cutoff = now - days * 86_400_000
  const expired = new Set(
    db
      .list<JobFilter>('jobs')
      .filter((j) => j.closedAt && Date.parse(j.closedAt) < cutoff)
      .map((j) => j.id)
  )
  const ids = db
    .list<Candidate>('candidates')
    .filter((c) => expired.has(c.jobId))
    .map((c) => c.id)
  deleteCandidates(db, dataDir, ids)
  return ids.length
}
