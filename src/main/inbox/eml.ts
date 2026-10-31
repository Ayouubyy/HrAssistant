import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { extname, join } from 'path'
import { simpleParser } from 'mailparser'
import type { EmailAttachment, EmailItem } from '../../shared/types'
import { sha256 } from '../ai/cache'

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

const safeName = (n: string): string => n.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'attachment'

export async function parseEmail(raw: Buffer, source: EmailItem['source'], attachDir: string): Promise<EmailItem> {
  const m = await simpleParser(raw)
  const id = sha256(m.messageId || raw).slice(0, 16)
  const dir = join(attachDir, id)
  const attachments: EmailAttachment[] = []
  for (const a of m.attachments) {
    if (a.contentDisposition === 'inline' && !a.filename) continue
    const fileName = safeName(a.filename || `attachment-${attachments.length + 1}`)
    mkdirSync(dir, { recursive: true })
    const path = join(dir, fileName)
    writeFileSync(path, a.content)
    attachments.push({ fileName, path, isCv: looksLikeCv(fileName) })
  }
  const text = (m.text || (typeof m.html === 'string' ? m.html.replace(/<[^>]+>/g, ' ') : '')).trim()
  return {
    id,
    source,
    from: m.from?.text ?? '',
    subject: m.subject ?? '(no subject)',
    date: (m.date ?? new Date()).toISOString(),
    text,
    threadCount: countThread(text),
    messageId: m.messageId,
    attachments
  }
}

export async function loadEmlFolder(folder: string, attachDir: string): Promise<EmailItem[]> {
  const files = readdirSync(folder).filter((f) => f.toLowerCase().endsWith('.eml'))
  return Promise.all(files.map((f) => parseEmail(readFileSync(join(folder, f)), 'eml', attachDir)))
}
