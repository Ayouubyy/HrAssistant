import { ImapFlow } from 'imapflow'
import nodemailer from 'nodemailer'

export interface GmailAuth {
  user: string
  pass: string
}

const imap = (a: GmailAuth): ImapFlow =>
  new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user: a.user, pass: a.pass.replace(/\s+/g, '') },
    logger: false
  })

export function friendlyGmailError(e: unknown): Error {
  const msg = String((e as Error)?.message ?? e)
  if (/auth|credentials|invalid|535|login/i.test(msg))
    return new Error("Couldn't connect to Gmail. Check the address and the app password.")
  if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network|timed? ?out/i.test(msg))
    return new Error("Couldn't reach Gmail. Check your internet connection.")
  return new Error(`Gmail error: ${msg.slice(0, 160)}`)
}

export async function testGmail(a: GmailAuth): Promise<void> {
  const client = imap(a)
  try {
    await client.connect()
    await client.logout()
  } catch (e) {
    throw friendlyGmailError(e)
  }
}

export async function fetchInbox(a: GmailAuth, limit = 30): Promise<Buffer[]> {
  const client = imap(a)
  const out: Buffer[] = []
  try {
    await client.connect()
    const lock = await client.getMailboxLock('INBOX')
    try {
      const total = typeof client.mailbox === 'object' ? client.mailbox.exists : 0
      if (total > 0) {
        for await (const msg of client.fetch(`${Math.max(1, total - limit + 1)}:*`, { source: true })) {
          if (msg.source) out.push(msg.source)
        }
      }
    } finally {
      lock.release()
    }
    await client.logout()
  } catch (e) {
    throw friendlyGmailError(e)
  }
  return out
}

export function replyAddress(from: string): string {
  return from.match(/<([^>]+)>/)?.[1] ?? from.trim()
}

export async function sendReply(
  a: GmailAuth,
  opts: { to: string; subject: string; body: string; inReplyTo?: string }
): Promise<void> {
  const transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: a.user, pass: a.pass.replace(/\s+/g, '') }
  })
  try {
    await transport.sendMail({
      from: a.user,
      to: opts.to,
      subject: /^re:/i.test(opts.subject) ? opts.subject : `Re: ${opts.subject}`,
      text: opts.body,
      inReplyTo: opts.inReplyTo,
      references: opts.inReplyTo
    })
  } catch (e) {
    throw friendlyGmailError(e)
  }
}
