import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import { simpleParser } from 'mailparser'
import type { EmailAttachment, EmailItem, SenderAuth } from '../../shared/types'
import { sha256 } from '../ai/cache'
import { checkSize, LIMITS } from '../security/active-content'
import { fileNameFlags, insideDir, isOpenable, markOfTheWeb, safeFileName, uniqueName } from '../security/files'
import { parseAuthResults } from '../security/sender'

const NOT_CV = /cover|letter|lettre|motivation|diplom|dipl[oô]me|degree|certificat|attestation|رسالة|شهادة|دبلوم/i
const CV_NAME = /\bcv\b|resume|résumé|curriculum|سيرة/i

export function looksLikeCv(fileName: string): boolean {
  const ext = extname(fileName).toLowerCase()
  if (!['.pdf', '.docx'].includes(ext)) return false
  return CV_NAME.test(fileName) || !NOT_CV.test(fileName)
}

export function countThread(text: string): number {
  const quoted = text.match(/(a écrit|wrote|كتب)\s*:?\s*$/gim)?.length ?? 0
  const forwarded = text.match(/^-{2,}\s*(original message|message d'origine)/gim)?.length ?? 0
  return 1 + quoted + forwarded
}

// Every Authentication-Results header, topmost first (the order they appear in the raw message).
function authHeaders(lines: ReadonlyArray<{ key: string; line: string }>): string[] {
  return lines
    .filter((h) => h.key === 'authentication-results')
    .map((h) => h.line.replace(/^[^:]*:\s*/, '').replace(/\r?\n[ \t]+/g, ' '))
}

export async function parseEmail(raw: Buffer, source: EmailItem['source'], attachDir: string): Promise<EmailItem> {
  checkSize(raw.length, LIMITS.emailBytes, 'email')
  const m = await simpleParser(raw)
  // Message-ID plus content: a reused Message-ID can't replace (or inherit the summary of) another email.
  const id = sha256(`${m.messageId ?? ''}|${sha256(raw)}`).slice(0, 16)
  const dir = join(attachDir, id)
  const attachments: EmailAttachment[] = []
  const taken = new Set<string>()
  for (const a of m.attachments) {
    if (a.contentDisposition === 'inline' && !a.filename) continue
    const original = a.filename || `attachment-${attachments.length + 1}`
    const fileName = uniqueName(safeFileName(original, `attachment-${attachments.length + 1}`), taken)
    const flags = fileNameFlags(original)
    if (a.content.length > LIMITS.attachmentBytes) {
      attachments.push({
        fileName,
        path: '',
        isCv: false,
        openable: false,
        flags: [...flags, { code: 'unsafe_attachment', severity: 'info', detail: `${fileName} is larger than 25 MB, so it wasn't saved.` }]
      })
      continue
    }
    mkdirSync(dir, { recursive: true })
    const path = insideDir(dir, fileName)
    writeFileSync(path, a.content)
    markOfTheWeb(path)
    const risky = flags.some((f) => f.severity !== 'info')
    attachments.push({ fileName, path, isCv: !risky && looksLikeCv(fileName), openable: !risky && isOpenable(fileName), flags })
  }
  const text = (m.text || (typeof m.html === 'string' ? m.html.replace(/<[^>]+>/g, ' ') : '')).trim()
  // An imported file can carry any header it likes, so only mail fetched from Gmail by the app is checked.
  const auth: SenderAuth =
    source === 'gmail' ? parseAuthResults(authHeaders(m.headerLines)) : { spf: null, dkim: null, dmarc: null, verdict: 'unknown' }
  return {
    id,
    source,
    from: m.from?.text ?? '',
    replyTo: m.replyTo?.text || undefined,
    subject: m.subject ?? '(no subject)',
    date: (m.date ?? new Date()).toISOString(),
    text,
    threadCount: countThread(text),
    messageId: m.messageId,
    attachments,
    auth: source === 'gmail' && auth.verdict === 'unknown' ? { ...auth, verdict: 'unverified' } : auth
  }
}

type Parse = (raw: Buffer, source: EmailItem['source'], attachDir: string) => Promise<EmailItem>

// Parses a few at a time (each in its own utility process in the app).
export async function parseAll(raws: Buffer[], source: EmailItem['source'], attachDir: string, parse: Parse = parseEmail): Promise<EmailItem[]> {
  const out: EmailItem[] = []
  for (let i = 0; i < raws.length; i += 4) {
    const batch = await Promise.allSettled(raws.slice(i, i + 4).map((r) => parse(r, source, attachDir)))
    out.push(...batch.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])))
  }
  return out
}

// Unreadable or oversized files are skipped so one bad email doesn't block the folder.
export async function loadEmlFolder(folder: string, attachDir: string, parse: Parse = parseEmail): Promise<EmailItem[]> {
  const files = readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.eml') && statSync(join(folder, f)).isFile())
  return parseAll(
    files.map((f) => readFileSync(join(folder, f))),
    'eml',
    attachDir,
    parse
  )
}
