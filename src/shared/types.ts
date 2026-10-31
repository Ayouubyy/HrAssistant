export type PresetId = 'generic' | 'banking' | 'insurance' | 'it' | 'telecom'

export interface SubScores {
  skills: number
  experience: number
  education: number
  languages: number
}
export type Weights = SubScores

export interface Requirement {
  id: string
  text: string
  mustHave: boolean
}

export interface RequirementResult {
  requirementId: string
  status: 'met' | 'not_met' | 'unclear'
  evidence: string
}

export interface CandidateIdentity {
  name: string | null
  email: string | null
  phone: string | null
}

export interface CandidateAnalysis {
  identity: CandidateIdentity
  yearsExperience: number | null
  languages: string[]
  subScores: SubScores
  requirements: RequirementResult[]
  matchedSkills: string[]
  missingSkills: string[]
  redFlags: string[]
  verdict: string
}

export type HrDecision = 'shortlist' | 'maybe' | 'reject' | null

export interface Candidate {
  id: string
  jobId: string
  fileName: string
  filePath: string
  fileHash: string
  source: 'upload' | 'email'
  status: 'pending' | 'processing' | 'done' | 'error'
  error?: string
  analysis?: CandidateAnalysis
  hrDecision: HrDecision
  restored: boolean
  revealed: boolean
}

export interface JobFilter {
  id: string
  title: string
  description: string
  preset: PresetId
  requirements: Requirement[]
  weights: Weights
  threshold: number
  autoRejectMissingMustHave: boolean
  autoRejectBelowThreshold: boolean
  createdAt: string
}

export interface Evaluation {
  score: number
  rejected: boolean
  reason: string | null
}

export type EmailCategory =
  | 'application'
  | 'leave'
  | 'payroll'
  | 'contract'
  | 'hours'
  | 'policy'
  | 'documents'
  | 'other'

export interface EmailTriage {
  category: EmailCategory
  urgent: boolean
  urgencyReason: string
  summary: string
  draftReply: string | null
  missingDocuments: string[]
}

export interface EmailAttachment {
  fileName: string
  path: string
  isCv: boolean
}

export interface EmailItem {
  id: string
  source: 'gmail' | 'eml'
  from: string
  subject: string
  date: string
  text: string
  threadCount: number
  messageId?: string
  attachments: EmailAttachment[]
  triage?: EmailTriage
  triageError?: string
}

export interface AppSettings {
  model: string
  policyText: string
  requiredDocs: string[]
  doubleCheck: boolean
  concurrency: number
}
