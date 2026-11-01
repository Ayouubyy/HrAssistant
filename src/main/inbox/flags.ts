import { mergeFlags } from '../../shared/flags'
import type { AppSettings, EmailItem, ReviewFlag } from '../../shared/types'
import { scanInjection } from '../security/injection'
import { authFlags, draftLinkFlags, replyToFlags, senderFlags } from '../security/sender'

// Every security flag for an email, computed from the email alone so it can be recomputed at any time.
export function emailFlags(e: EmailItem, settings: AppSettings): ReviewFlag[] {
  const suspicious = e.triage?.suspiciousInstructions ?? []
  const model: ReviewFlag[] = suspicious.length
    ? [
        {
          code: 'model_reported_injection',
          severity: 'high',
          detail: 'The AI reported text in this email that tries to instruct it. It was told to ignore it.',
          evidence: suspicious.join(' · ').slice(0, 120)
        }
      ]
    : []
  const duplicate: ReviewFlag[] = e.duplicateMessageId
    ? [{ code: 'duplicate_message_id', severity: 'warn', detail: 'Another email in the inbox has the same Message-ID but different content.' }]
    : []
  return mergeFlags(
    scanInjection(`${e.subject}\n${e.text}`, 'This email'),
    model,
    duplicate,
    e.auth ? authFlags(e.auth) : [],
    senderFlags(e.from, settings.companyDomains),
    replyToFlags(e.from, e.replyTo),
    e.attachments.flatMap((a) => a.flags ?? []),
    draftLinkFlags(e.triage?.draftReply ?? null, e.text, e.from, settings.companyDomains)
  )
}
