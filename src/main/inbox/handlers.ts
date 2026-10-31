import { app, dialog, shell } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import type { EmailItem } from '../../shared/types'
import { cacheKey, sha256, type Cached } from '../ai/cache'
import { RetryableError } from '../ai/provider'
import type { createPipeline } from '../cv/pipeline'
import { push, type Ctx } from '../ipc'
import { getProvider } from '../jobs'
import { getSettings } from '../store/settings'
import { getSecret, setSecret } from '../store/secrets'
import { loadEmlFolder, parseEmail } from './eml'
import { fetchInbox, replyAddress, sendReply, testGmail, type GmailAuth } from './gmail'

function gmailAuth(): GmailAuth | null {
  const user = getSecret('gmailUser')
  const pass = getSecret('gmailAppPassword')
  return user && pass ? { user, pass } : null
}
import { MAIL_PROMPT_VERSION, triageEmail } from './triage'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function sortEmails(list: EmailItem[]): EmailItem[] {
  return list.slice().sort((a, b) => {
    const ua = a.triage?.urgent ? 1 : 0
    const ub = b.triage?.urgent ? 1 : 0
    return ub - ua || b.date.localeCompare(a.date)
  })
}

export function createInbox(ctx: Ctx, cached: Cached): {
  store: (emails: EmailItem[]) => void
  triageAll: () => Promise<void>
} {
  const { db } = ctx
  let running = false

  async function triageOne(email: EmailItem): Promise<void> {
    const settings = getSettings()
    const ai = getProvider()
    const key = cacheKey(email.id, MAIL_PROMPT_VERSION, ai.model, sha256(settings.policyText + settings.requiredDocs.join('|')))
    for (let attempt = 0; ; attempt++) {
      try {
        const triage = await cached(key, () => triageEmail(ai, email, settings))
        const next = { ...db.get<EmailItem>('emails', email.id)!, triage, triageError: undefined }
        db.put('emails', next)
        push(ctx, 'emails:updated', next)
        return
      } catch (e) {
        if (e instanceof RetryableError && attempt < 4) {
          await sleep(2000 * 2 ** attempt)
          continue
        }
        const next = { ...db.get<EmailItem>('emails', email.id)!, triageError: (e as Error).message }
        db.put('emails', next)
        push(ctx, 'emails:updated', next)
        return
      }
    }
  }

  return {
    store(emails) {
      for (const e of emails) {
        const old = db.get<EmailItem>('emails', e.id)
        db.put('emails', old ? { ...e, triage: old.triage } : e)
      }
      push(ctx, 'emails:changed', null)
    },
    async triageAll() {
      if (running) return
      running = true
      try {
        const todo = db.list<EmailItem>('emails').filter((e) => !e.triage)
        const workers = Array.from({ length: Math.max(1, getSettings().concurrency) }, async () => {
          while (todo.length) await triageOne(todo.shift()!)
        })
        await Promise.all(workers)
      } finally {
        running = false
      }
    }
  }
}

export function inboxHandlers(
  ctx: Ctx,
  inbox: ReturnType<typeof createInbox>,
  pipeline: ReturnType<typeof createPipeline>
): Record<string, (...a: never[]) => unknown> {
  const { db } = ctx
  const attachDir = join(ctx.dataDir, 'attachments')
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
      const emails = await loadEmlFolder(r.filePaths[0], attachDir)
      inbox.store(emails)
      void inbox.triageAll()
      return emails.length
    },
    'gmail:status': () => ({ connected: !!gmailAuth(), user: getSecret('gmailUser') }),
    'gmail:connect': async (user: string, pass: string) => {
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
      const emails = await Promise.all(raws.map((r) => parseEmail(r, 'gmail', attachDir)))
      inbox.store(emails)
      void inbox.triageAll()
      return emails.length
    },
    'gmail:send': async (emailId: string, body: string) => {
      const auth = gmailAuth()
      const e = db.get<EmailItem>('emails', emailId)
      if (!auth) throw new Error('Connect Gmail first.')
      if (!e) throw new Error('Email not found.')
      await sendReply(auth, { to: replyAddress(e.from), subject: e.subject, body, inReplyTo: e.messageId })
    },
    'inbox:triageAll': () => inbox.triageAll(),
    'inbox:retriage': async (id: string) => {
      const e = db.get<EmailItem>('emails', id)
      if (!e) return
      db.put('emails', { ...e, triage: undefined, triageError: undefined })
      await inbox.triageAll()
    },
    'inbox:clear': () => {
      for (const e of db.list<EmailItem>('emails')) db.remove('emails', e.id)
      push(ctx, 'emails:changed', null)
    },
    'inbox:openAttachment': (path: string) => void shell.openPath(path),
    'inbox:sendToScreening': async (emailId: string, jobId: string) => {
      const e = db.get<EmailItem>('emails', emailId)
      if (!e) return 0
      const added = await pipeline.addFiles(
        jobId,
        e.attachments.filter((a) => a.isCv).map((a) => a.path),
        'email'
      )
      return added.length
    }
  }
}
