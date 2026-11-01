import { app, dialog, shell } from 'electron'
import { existsSync, readFileSync, rmSync } from 'fs'
import { extname, join } from 'path'
import type { EmailItem, JobFilter, ReviewFlag } from '../../shared/types'
import { cacheId, cacheKey, removeCached, sha256, type Cached } from '../ai/cache'
import { withRetry } from '../ai/provider'
import type { createPipeline } from '../cv/pipeline'
import { push, type Ctx } from '../ipc'
import { getProvider } from '../jobs'
import { getSettings } from '../store/settings'
import { getSecret, setSecret } from '../store/secrets'
import { emailFlags } from './flags'
import { loadEmlFolder, parseAll } from './eml'
import { parseEmailInWorker } from '../parse-host'
import { createSerialRunner } from './runner'
import { fetchInbox, replyAddress, sendReply, testGmail, type GmailAuth } from './gmail'
import { MAIL_PROMPT_VERSION, policyFor, triageEmail } from './triage'
import { assertId, assertIndex, assertString } from '../security/validate'
import { checkZipBomb, scanDocx, scanPdfBytes, zipEntries } from '../security/active-content'
import { defenderScan } from '../security/defender'
import { logDecision } from '../store/audit'
import { mailRef } from '../../shared/refs'

function gmailAuth(): GmailAuth | null {
  const user = getSecret('gmailUser')
  const pass = getSecret('gmailAppPassword')
  return user && pass ? { user, pass } : null
}

// Urgent first, newest next. An email from a spoofed sender never jumps the queue as urgent.
export function sortEmails(list: EmailItem[]): EmailItem[] {
  const urgent = (e: EmailItem): number => (e.triage?.urgent && e.auth?.verdict !== 'spoofed' ? 1 : 0)
  return list.slice().sort((a, b) => urgent(b) - urgent(a) || b.date.localeCompare(a.date))
}

export function createInbox(
  ctx: Ctx,
  cached: Cached
): {
  store: (emails: EmailItem[]) => void
  triageAll: () => Promise<void>
  refreshFlags: () => void
  retriage: (id: string) => Promise<void>
} {
  const { db } = ctx

  // Flags are always recomputed from the email itself, so a dismissal survives only while they stay the same.
  const withFlags = (e: EmailItem, old?: EmailItem | null): EmailItem => {
    const flags = emailFlags(e, getSettings())
    const same = JSON.stringify(flags.map((f) => f.code)) === JSON.stringify((old?.flags ?? []).map((f) => f.code))
    return { ...e, flags, flagsDismissed: !!old?.flagsDismissed && same }
  }

  const triageKey = (email: EmailItem, model: string): string => {
    const settings = getSettings()
    return cacheKey(
      email.id,
      MAIL_PROMPT_VERSION,
      model,
      sha256(policyFor(email, settings) + settings.requiredDocs.join('|') + settings.companyDomains.join('|'))
    )
  }

  async function triageOne(email: EmailItem): Promise<void> {
    const settings = getSettings()
    const ai = getProvider()
    const key = triageKey(email, ai.model)
    const cur = db.get<EmailItem>('emails', email.id)
    if (!cur) return
    let next: EmailItem
    try {
      const triage = await withRetry(() => cached(key, () => triageEmail(ai, email, settings)))
      next = withFlags({ ...cur, triage, triageError: undefined }, cur)
    } catch (e) {
      next = { ...cur, triageError: (e as Error).message }
    }
    if (!db.get<EmailItem>('emails', email.id)) return
    db.put('emails', next)
    push(ctx, 'emails:updated', next)
  }

  return {
    store(emails) {
      for (const e of emails) {
        const old = db.get<EmailItem>('emails', e.id)
        // Same Message-ID, different content: both are kept and both are marked.
        const twins = e.messageId ? db.list<EmailItem>('emails').filter((x) => x.messageId === e.messageId && x.id !== e.id) : []
        for (const t of twins) if (!t.duplicateMessageId) db.put('emails', withFlags({ ...t, duplicateMessageId: true }, t))
        const next = { ...(old ? { ...e, triage: old.triage } : e), duplicateMessageId: twins.length > 0 || undefined }
        db.put('emails', withFlags(next, old))
      }
      push(ctx, 'emails:changed', null)
    },
    triageAll: createSerialRunner(async () => {
      const todo = db.list<EmailItem>('emails').filter((e) => !e.triage && !e.triageError)
      const workers = Array.from({ length: Math.max(1, getSettings().concurrency) }, async () => {
        while (todo.length) await triageOne(todo.shift()!)
      })
      await Promise.all(workers)
    }),
    // A fresh AI reading: the cached answer for this email is dropped first.
    async retriage(id) {
      const e = db.get<EmailItem>('emails', id)
      if (!e) return
      removeCached(join(ctx.dataDir, 'cache'), [cacheId(triageKey(e, getProvider().model))])
      db.put('emails', { ...e, triage: undefined, triageError: undefined })
      await this.triageAll()
    },
    // Company domains changed: lookalike and display-name checks depend on them.
    refreshFlags() {
      for (const e of db.list<EmailItem>('emails')) db.put('emails', withFlags(e, e))
      push(ctx, 'emails:changed', null)
    }
  }
}

// What the CV checks find in an attachment. Only PDF and DOCX get the content scan; images and text can't carry code.
async function attachmentRisks(path: string): Promise<string[]> {
  const found: string[] = []
  const ext = extname(path).toLowerCase()
  try {
    const data = readFileSync(path)
    let flags: ReviewFlag[] = []
    if (ext === '.pdf') flags = scanPdfBytes(data)
    else if (ext === '.docx') {
      const entries = zipEntries(data)
      checkZipBomb(entries, data)
      flags = await scanDocx(data, entries)
    }
    if (flags.length) found.push('active content (scripts, macros or embedded files)')
  } catch {
    found.push('a structure that couldn’t be checked')
  }
  if ((await defenderScan(path)) === 'threat') found.push('a threat found by Microsoft Defender')
  return found
}

export function inboxHandlers(
  ctx: Ctx,
  inbox: ReturnType<typeof createInbox>,
  pipeline: ReturnType<typeof createPipeline>
): Record<string, (...a: never[]) => unknown> {
  const { db } = ctx
  const attachDir = join(ctx.dataDir, 'attachments')
  const email = (id: string): EmailItem => {
    assertId(id)
    const e = db.get<EmailItem>('emails', id)
    if (!e) throw new Error('Email not found.')
    return e
  }
  return {
    'inbox:list': () => sortEmails(db.list<EmailItem>('emails')),
    'inbox:loadDemo': async () => {
      const demo = join(app.getAppPath(), 'test-data', 'inbox')
      const r = await dialog.showOpenDialog({
        title: 'Choose a folder of .eml emails',
        defaultPath: existsSync(demo) ? demo : undefined,
        properties: ['openDirectory']
      })
      if (r.canceled) return 0
      const emails = await loadEmlFolder(r.filePaths[0], attachDir, parseEmailInWorker)
      inbox.store(emails)
      void inbox.triageAll()
      return emails.length
    },
    'gmail:status': () => ({ connected: !!gmailAuth(), user: getSecret('gmailUser') }),
    'gmail:connect': async (user: string, pass: string) => {
      assertString(user, 200)
      assertString(pass, 200)
      await testGmail({ user: user.trim(), pass })
      setSecret('gmailUser', user.trim())
      setSecret('gmailAppPassword', pass)
    },
    'gmail:disconnect': () => {
      setSecret('gmailUser', null)
      setSecret('gmailAppPassword', null)
    },
    'gmail:refresh': async () => {
      const auth = gmailAuth()
      if (!auth) throw new Error('Connect Gmail first.')
      const raws = await fetchInbox(auth)
      const emails = await parseAll(raws, 'gmail', attachDir, parseEmailInWorker)
      inbox.store(emails)
      void inbox.triageAll()
      return emails.length
    },
    'gmail:recipient': (emailId: string) => replyAddress(email(emailId)),
    'gmail:send': async (emailId: string, body: string) => {
      assertString(body, 50_000)
      const auth = gmailAuth()
      const e = email(emailId)
      if (!auth) throw new Error('Connect Gmail first.')
      const to = replyAddress(e)
      const hijack = e.flags?.some((f) => f.code === 'reply_to_mismatch')
      // Confirmed in the main process, so nothing can send without HR seeing the real recipient.
      const r = await dialog.showMessageBox({
        type: hijack ? 'warning' : 'question',
        buttons: ['Send', 'Cancel'],
        defaultId: hijack ? 1 : 0,
        cancelId: 1,
        title: 'Send reply',
        message: `Send to ${to}?`,
        detail: hijack ? `This address is different from the sender's (${e.from}). Make sure you trust it.` : undefined
      })
      if (r.response !== 0) return false
      await sendReply(auth, { to, subject: e.subject, body, inReplyTo: e.messageId })
      logDecision(ctx.dataDir, { action: 'send_reply', ref: mailRef(e.id), emailId: e.id, reason: `to ${to}` })
      return true
    },
    'inbox:triageAll': () => inbox.triageAll(),
    'inbox:retriage': (id: string) => inbox.retriage(email(id).id),
    'inbox:clear': () => {
      for (const e of db.list<EmailItem>('emails')) {
        db.remove('emails', e.id)
        rmSync(join(attachDir, e.id), { recursive: true, force: true })
      }
      push(ctx, 'emails:changed', null)
    },
    'inbox:dismissFlags': (id: string) => {
      const e = email(id)
      logDecision(ctx.dataDir, {
        action: 'dismiss_flags',
        ref: mailRef(e.id),
        emailId: e.id,
        reason: (e.flags ?? []).filter((f) => f.severity === 'high').map((f) => f.code).join(',')
      })
      const next = { ...e, flagsDismissed: true }
      db.put('emails', next)
      push(ctx, 'emails:updated', next)
    },
    'inbox:openAttachment': async (emailId: string, index: number) => {
      assertIndex(index)
      const a = email(emailId).attachments[index]
      if (!a?.path || !existsSync(a.path)) throw new Error('This attachment is no longer on this computer.')
      if (a.openable) {
        // The same checks a CV gets before it opens: active content, then Microsoft Defender.
        const found = await attachmentRisks(a.path)
        if (found.length) {
          const r = await dialog.showMessageBox({
            type: 'warning',
            buttons: ['Open anyway', 'Cancel'],
            defaultId: 1,
            cancelId: 1,
            title: 'Open attachment',
            message: `${a.fileName} contains ${found.join(' and ')}.`,
            detail: 'Normal documents don’t. Open it only if you trust the sender.'
          })
          if (r.response !== 0) return
        }
        return void (await shell.openPath(a.path))
      }
      const r = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Show in folder', 'Close'],
        defaultId: 1,
        cancelId: 1,
        title: 'Attachment',
        message: "This file type can't be opened from HR Assistant.",
        detail: `${a.fileName} could run code on this computer. If you trust the sender, find it in its folder and scan it first.`
      })
      if (r.response === 0) shell.showItemInFolder(a.path)
    },
    'inbox:sendToScreening': async (emailId: string, jobId: string) => {
      assertId(jobId)
      if (!db.get<JobFilter>('jobs', jobId)) throw new Error('Job filter not found.')
      const e = email(emailId)
      const added = await pipeline.addFiles(
        jobId,
        e.attachments.filter((a) => a.isCv && a.path).map((a) => a.path),
        'email'
      )
      return added.length
    }
  }
}
