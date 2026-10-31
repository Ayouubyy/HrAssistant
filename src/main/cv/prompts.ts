import { randomUUID } from 'crypto'
import { PRESETS } from '../../shared/presets'
import type { CandidateAnalysis, JobFilter, PresetId, Requirement, RequirementResult } from '../../shared/types'
import type { AIProvider } from '../ai/provider'
import { clamp100, str, strArr } from '../ai/json'

export const CV_PROMPT_VERSION = 'cv-v1'

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE = /\+?\d[\d\s().-]{7,}\d/g

export function redactContacts(text: string): { text: string; email: string | null; phone: string | null } {
  const email = text.match(EMAIL)?.[0] ?? null
  let phone: string | null = null
  const out = text.replace(EMAIL, '[email]').replace(PHONE, (m) => {
    if (m.replace(/\D/g, '').length < 9) return m
    phone ??= m.trim()
    return '[phone]'
  })
  return { text: out, email, phone }
}

const SUB = {
  type: 'object',
  properties: {
    skills: { type: 'integer' },
    experience: { type: 'integer' },
    education: { type: 'integer' },
    languages: { type: 'integer' }
  },
  required: ['skills', 'experience', 'education', 'languages']
}

const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: "Candidate's full name as written in the CV, or empty" },
    yearsExperience: { type: 'number', description: 'Total years of relevant professional experience' },
    languages: { type: 'array', items: { type: 'string' } },
    subScores: SUB,
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          requirementId: { type: 'string' },
          status: { type: 'string', enum: ['met', 'not_met', 'unclear'] },
          evidence: { type: 'string' }
        },
        required: ['requirementId', 'status', 'evidence']
      }
    },
    matchedSkills: { type: 'array', items: { type: 'string' } },
    missingSkills: { type: 'array', items: { type: 'string' } },
    redFlags: { type: 'array', items: { type: 'string' } },
    verdict: { type: 'string' }
  },
  required: ['name', 'subScores', 'requirements', 'matchedSkills', 'missingSkills', 'redFlags', 'verdict']
}

function analysisSystem(preset: PresetId): string {
  return `You are an expert recruitment screening assistant. You help an HR manager pre-screen CVs; the HR manager makes every final decision.
${PRESETS[preset].guidance}

Rules:
- Judge only job-relevant qualifications: skills, experience, education, certifications and languages.
- Completely ignore name, gender, age, photo, nationality, ethnicity, religion, address and marital status. They must not influence any score.
- Sub-scores are integers from 0 to 100:
  skills = how well the CV's skills match the job's required and preferred skills;
  experience = relevance and amount of experience for this role;
  education = how well degree level and field fit the job;
  languages = coverage of the languages the job needs.
- For each job requirement, return one entry with its exact requirementId. status "met" if the CV shows it, "not_met" if the CV clearly lacks it (for example a languages section without that language, or a degree in an unrelated field), "unclear" only if the CV is genuinely ambiguous. evidence is a short quote from the CV (empty if none).
- matchedSkills / missingSkills: short skill names relative to the job.
- redFlags: concrete concerns only (unexplained gaps, inconsistent dates, very short stints). Empty if none.
- verdict: one sentence of at most 20 words, written in the same language as the job description.`
}

function analysisPrompt(job: JobFilter, cvText: string): string {
  const reqs = job.requirements
    .map((r) => `- [${r.id}] ${r.text}${r.mustHave ? ' (MUST-HAVE)' : ''}`)
    .join('\n')
  return `JOB TITLE: ${job.title}

JOB DESCRIPTION:
${job.description}

REQUIREMENTS:
${reqs || '(none listed)'}

CV:
${cvText}`
}

export function normalizeAnalysis(
  raw: unknown,
  job: JobFilter,
  contacts: { email: string | null; phone: string | null }
): CandidateAnalysis {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const sub = (r.subScores && typeof r.subScores === 'object' ? r.subScores : {}) as Record<string, unknown>
  const given = Array.isArray(r.requirements) ? (r.requirements as Record<string, unknown>[]) : []
  const requirements: RequirementResult[] = job.requirements.map((req) => {
    const g = given.find((x) => x && x.requirementId === req.id)
    const status = g && ['met', 'not_met', 'unclear'].includes(g.status as string) ? g.status : 'unclear'
    return { requirementId: req.id, status: status as RequirementResult['status'], evidence: str(g?.evidence) }
  })
  const years = Number(r.yearsExperience)
  return {
    identity: { name: str(r.name) || null, email: contacts.email, phone: contacts.phone },
    yearsExperience: Number.isFinite(years) ? years : null,
    languages: strArr(r.languages),
    subScores: {
      skills: clamp100(sub.skills),
      experience: clamp100(sub.experience),
      education: clamp100(sub.education),
      languages: clamp100(sub.languages)
    },
    requirements,
    matchedSkills: strArr(r.matchedSkills),
    missingSkills: strArr(r.missingSkills),
    redFlags: strArr(r.redFlags),
    verdict: str(r.verdict)
  }
}

export async function analyzeCv(ai: AIProvider, job: JobFilter, cvText: string): Promise<CandidateAnalysis> {
  const redacted = redactContacts(cvText)
  const raw = await ai.json<unknown>({
    system: analysisSystem(job.preset),
    prompt: analysisPrompt(job, redacted.text),
    schema: ANALYSIS_SCHEMA
  })
  return normalizeAnalysis(raw, job, redacted)
}

const REQ_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    requirements: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, mustHave: { type: 'boolean' } },
        required: ['text', 'mustHave']
      }
    }
  },
  required: ['title', 'requirements']
}

export async function extractRequirements(
  ai: AIProvider,
  description: string,
  preset: PresetId
): Promise<{ title: string; requirements: Requirement[] }> {
  const raw = await ai.json<{ title?: unknown; requirements?: unknown }>({
    system: `You turn a job description into a short checklist of candidate requirements for CV screening.
${PRESETS[preset].guidance}
Return 4 to 10 requirements, each a short phrase (max 8 words) in the language of the job description.
mustHave is true only for requirements the description marks as mandatory/required/obligatoire or that are clearly essential; everything else is false.
title is the job title in the description's language.`,
    prompt: description,
    schema: REQ_SCHEMA
  })
  const list = Array.isArray(raw.requirements) ? (raw.requirements as Record<string, unknown>[]) : []
  return {
    title: str(raw.title),
    requirements: list
      .filter((x) => x && str(x.text).trim())
      .map((x) => ({ id: randomUUID().slice(0, 8), text: str(x.text).trim(), mustHave: x.mustHave === true }))
  }
}
