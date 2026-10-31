import type { AppSettings, EmailCategory, EmailItem, EmailTriage } from '../../shared/types'
import type { AIProvider } from '../ai/provider'
import { str, strArr } from '../ai/json'

export const MAIL_PROMPT_VERSION = 'mail-v1'

const CATEGORIES: EmailCategory[] = ['application', 'leave', 'payroll', 'contract', 'hours', 'policy', 'documents', 'other']

const SCHEMA = {
  type: 'object',
  properties: {
    category: { type: 'string', enum: CATEGORIES },
    urgent: { type: 'boolean' },
    urgencyReason: { type: 'string' },
    summary: { type: 'string' },
    draftReply: { type: 'string', description: 'Empty string when no reply is appropriate (e.g. newsletters)' },
    missingDocuments: { type: 'array', items: { type: 'string' } }
  },
  required: ['category', 'urgent', 'urgencyReason', 'summary', 'draftReply', 'missingDocuments']
}

export function normalizeTriage(raw: unknown): EmailTriage {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const category = CATEGORIES.includes(r.category as EmailCategory) ? (r.category as EmailCategory) : 'other'
  return {
    category,
    urgent: r.urgent === true,
    urgencyReason: str(r.urgencyReason),
    summary: str(r.summary),
    draftReply: str(r.draftReply).trim() || null,
    missingDocuments: category === 'application' ? strArr(r.missingDocuments) : []
  }
}

export async function triageEmail(ai: AIProvider, email: EmailItem, settings: AppSettings): Promise<EmailTriage> {
  const system = `You are the inbox assistant of an HR department. You prepare work for the HR manager; they review and send everything themselves.
For the email, return:
- category: application (job application), leave (holidays/absence), payroll (salary/pay issues), contract (contract/renewal), hours (working hours/schedule), policy (company policy/benefits question), documents (request for an HR document such as a work certificate), other (newsletters, spam, anything else).
- urgent: true only if a delay would cause real harm soon (e.g. salary not paid, deadline today/tomorrow, legal issue). urgencyReason: one short sentence (empty if not urgent).
- summary: 1–2 sentences; for a long thread, summarize the whole history and what is being asked now.
- draftReply: a polite, short reply from the HR department, written in the same language as the email, signed "Service RH". For policy questions, use ONLY the company policy below; if it does not cover the question, say HR will check and come back. Never invent facts, amounts or dates. For applications, acknowledge receipt and, if documents are missing, politely ask for them. Empty for newsletters/spam.
- missingDocuments: only for applications. Required documents: ${settings.requiredDocs.join(', ')}. Compare against the attachment names and the email body; list the required ones that are missing (use the names from the required list).

COMPANY POLICY:
${settings.policyText.trim() || '(none provided)'}`
  const prompt = `From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}
Attachments: ${email.attachments.map((a) => a.fileName).join(', ') || 'none'}

${email.text.slice(0, 12000)}`
  return normalizeTriage(await ai.json<unknown>({ system, prompt, schema: SCHEMA }))
}
