import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { userInfo } from 'os'
import { join } from 'path'

// Append-only record of HR decisions: who, when, on what, and with which settings. It holds refs and
// ids only, never CV text, names or email content.
export interface AuditEntry {
  at: string
  user: string
  action: string
  ref: string
  jobId?: string
  candidateId?: string
  emailId?: string
  score?: number
  reason?: string
  settings?: Record<string, unknown>
}

const file = (dataDir: string): string => join(dataDir, 'audit.jsonl')

const windowsUser = (): string => {
  try {
    return userInfo().username
  } catch {
    return 'unknown'
  }
}

export function logDecision(dataDir: string, entry: Omit<AuditEntry, 'at' | 'user'>): void {
  mkdirSync(dataDir, { recursive: true })
  appendFileSync(file(dataDir), JSON.stringify({ at: new Date().toISOString(), user: windowsUser(), ...entry }) + '\n')
}

export function readDecisions(dataDir: string): AuditEntry[] {
  if (!existsSync(file(dataDir))) return []
  return readFileSync(file(dataDir), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as AuditEntry]
      } catch {
        return []
      }
    })
}
