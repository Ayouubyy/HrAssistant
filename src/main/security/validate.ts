import { existsSync } from 'fs'
import { isAbsolute } from 'path'
import type { AppSettings, Candidate, JobFilter, PresetId } from '../../shared/types'

// Main-process checks on everything the renderer sends (T-30). A compromised renderer
// must not be able to pass odd types, unknown fields or arbitrary paths.

export class InvalidRequestError extends Error {
  constructor(what: string) {
    super(`Invalid request: ${what}.`)
  }
}

export function assertString(v: unknown, max = 10_000, what = 'text'): asserts v is string {
  if (typeof v !== 'string' || v.length > max) throw new InvalidRequestError(what)
}

export function assertId(v: unknown): asserts v is string {
  if (typeof v !== 'string' || !/^[A-Za-z0-9-]{1,64}$/.test(v)) throw new InvalidRequestError('id')
}

export function assertIndex(v: unknown): asserts v is number {
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 1000) throw new InvalidRequestError('index')
}

const PRESET_IDS: PresetId[] = ['generic', 'banking', 'insurance', 'it', 'telecom']

export function assertPreset(v: unknown): asserts v is PresetId {
  if (!PRESET_IDS.includes(v as PresetId)) throw new InvalidRequestError('industry preset')
}
const num = (v: unknown, min: number, max: number): boolean => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const strArr = (v: unknown, maxItems: number, maxLen: number): boolean =>
  Array.isArray(v) && v.length <= maxItems && v.every((x) => typeof x === 'string' && x.length <= maxLen)

export function validateSettingsPatch(patch: unknown): Partial<AppSettings> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new InvalidRequestError('settings')
  const p = patch as Record<string, unknown>
  const rules: Record<keyof AppSettings, (v: unknown) => boolean> = {
    model: (v) => typeof v === 'string' && /^[a-z0-9.-]{1,64}$/.test(v),
    policyText: (v) => typeof v === 'string' && v.length <= 50_000,
    requiredDocs: (v) => strArr(v, 20, 60),
    doubleCheck: (v) => typeof v === 'boolean',
    concurrency: (v) => Number.isInteger(v) && num(v, 1, 8),
    companyDomains: (v) => strArr(v, 20, 100) && (v as string[]).every((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d)),
    autoLockMinutes: (v) => Number.isInteger(v) && num(v, 0, 240),
    retentionDays: (v) => Number.isInteger(v) && num(v, 0, 3650),
    freeTierAcknowledged: (v) => typeof v === 'boolean'
  }
  for (const [k, v] of Object.entries(p)) {
    const rule = rules[k as keyof AppSettings]
    if (!rule) throw new InvalidRequestError(`unknown setting ${k}`)
    if (!rule(v)) throw new InvalidRequestError(`setting ${k}`)
  }
  return p as Partial<AppSettings>
}

export function validateJob(job: unknown): JobFilter {
  const j = job as JobFilter
  const ok =
    j &&
    typeof j === 'object' &&
    (j.id === '' || /^[A-Za-z0-9-]{1,64}$/.test(j.id)) &&
    typeof j.title === 'string' &&
    j.title.length <= 200 &&
    typeof j.description === 'string' &&
    j.description.length <= 100_000 &&
    PRESET_IDS.includes(j.preset) &&
    Array.isArray(j.requirements) &&
    j.requirements.length <= 30 &&
    j.requirements.every(
      (r) => r && typeof r.id === 'string' && r.id.length <= 64 && typeof r.text === 'string' && r.text.length <= 300 && typeof r.mustHave === 'boolean'
    ) &&
    j.weights &&
    ['skills', 'experience', 'education', 'languages'].every((k) => num(j.weights[k as keyof JobFilter['weights']], 0, 10)) &&
    num(j.threshold, 0, 100) &&
    typeof j.autoRejectMissingMustHave === 'boolean' &&
    typeof j.autoRejectBelowThreshold === 'boolean' &&
    typeof j.createdAt === 'string' &&
    (j.closedAt === undefined || typeof j.closedAt === 'string')
  if (!ok) throw new InvalidRequestError('job filter')
  const { id, title, description, preset, requirements, weights, threshold, autoRejectMissingMustHave, autoRejectBelowThreshold, createdAt, closedAt } = j
  return {
    id,
    title,
    description,
    preset,
    requirements: requirements.map(({ id, text, mustHave }) => ({ id, text, mustHave })),
    weights: { skills: weights.skills, experience: weights.experience, education: weights.education, languages: weights.languages },
    threshold,
    autoRejectMissingMustHave,
    autoRejectBelowThreshold,
    createdAt,
    ...(closedAt ? { closedAt } : {})
  }
}

// HR can change only these fields of a candidate from the UI.
export function validateCandidatePatch(patch: unknown): Partial<Candidate> {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new InvalidRequestError('candidate')
  const p = patch as Record<string, unknown>
  const rules: Record<string, (v: unknown) => boolean> = {
    hrDecision: (v) => v === null || v === 'shortlist' || v === 'maybe' || v === 'reject',
    restored: (v) => typeof v === 'boolean',
    revealed: (v) => typeof v === 'boolean',
    flagsDismissed: (v) => typeof v === 'boolean'
  }
  for (const [k, v] of Object.entries(p)) if (!rules[k]?.(v)) throw new InvalidRequestError(`candidate field ${k}`)
  return p as Partial<Candidate>
}

// Paths come from a file dialog or a drop; only existing absolute paths get through.
// The pipeline then keeps only .pdf/.docx inside folders and reports any other file as unsupported.
export function validatePaths(paths: unknown): string[] {
  if (!Array.isArray(paths) || paths.length > 1000) throw new InvalidRequestError('files')
  return paths.filter((p): p is string => typeof p === 'string' && isAbsolute(p) && existsSync(p))
}

export function validateRef(ref: unknown): { kind: 'job'; jobId: string } | { kind: 'email'; emailId: string } | { kind: 'none' } {
  const r = ref as Record<string, unknown>
  if (r?.kind === 'job') return assertId(r.jobId), { kind: 'job', jobId: r.jobId as string }
  if (r?.kind === 'email') return assertId(r.emailId), { kind: 'email', emailId: r.emailId as string }
  if (r?.kind === 'none') return { kind: 'none' }
  throw new InvalidRequestError('context')
}

export function validateHistory(h: unknown): { role: 'user' | 'assistant'; content: string }[] {
  if (!Array.isArray(h) || h.length > 200) throw new InvalidRequestError('chat history')
  return h.map((m) => {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string' || m.content.length > 20_000)
      throw new InvalidRequestError('chat message')
    return { role: m.role, content: m.content }
  })
}
