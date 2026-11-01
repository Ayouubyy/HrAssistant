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
  suspiciousInstructions?: string[]
}

export type FlagSeverity = 'info' | 'warn' | 'high'

export type FlagCode =
  | 'injection_phrase'
  | 'model_reported_injection'
  | 'hidden_text'
  | 'invalid_output'
  | 'quote_not_found'
  | 'score_anomaly'
  | 'jd_copy'
  | 'keyword_stuffing'
  | 'active_content'
  | 'malware'
  | 'sender_unverified'
  | 'sender_spoofed'
  | 'lookalike_domain'
  | 'disposable_domain'
  | 'reply_to_mismatch'
  | 'draft_has_link'
  | 'unsafe_attachment'

// A security signal shown to HR. Flags never change a score or reject anyone; HR can dismiss them.
export interface ReviewFlag {
  code: FlagCode
  severity: FlagSeverity
  detail: string
  evidence?: string
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
  flags?: ReviewFlag[]
  flagsDismissed?: boolean
  // AI cache entries used for this candidate, removed when it's deleted
  cacheIds?: string[]
  // Microsoft Defender result for the CV file
  scan?: 'clean' | 'threat' | 'unavailable'
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
  closedAt?: string
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
  suspiciousInstructions?: string[]
  // what the AI thought was missing, when it differs from the local attachment check
  aiMissingDocuments?: string[]
  draftReply: string | null
  missingDocuments: string[]
}

export interface EmailAttachment {
  fileName: string
  path: string
  isCv: boolean
  openable?: boolean
  flags?: ReviewFlag[]
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
  replyTo?: string
  auth?: SenderAuth
  triage?: EmailTriage
  triageError?: string
  flags?: ReviewFlag[]
  flagsDismissed?: boolean
}

// Read from Gmail's Authentication-Results header. 'unknown' when there is none (an imported .eml file).
export interface SenderAuth {
  spf: string | null
  dkim: string | null
  dmarc: string | null
  verdict: 'verified' | 'unverified' | 'spoofed' | 'unknown'
}

export interface AppSettings {
  model: string
  policyText: string
  requiredDocs: string[]
  doubleCheck: boolean
  concurrency: number
  companyDomains: string[]
  autoLockMinutes: number
  retentionDays: number
}
