import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle,
  Copy,
  FileText,
  FolderOpen,
  Loader2,
  MessagesSquare,
  Paperclip,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserPlus
} from 'lucide-react'
import type { EmailCategory, EmailItem, JobFilter } from '@shared/types'
import { api, errorMessage } from '../api'
import type { Route } from '../App'
import { Button, Card, Chip, Textarea } from '../components/ui'
import { NeedsReviewChip, SecurityFlags } from '../components/SecurityFlags'
import { mailRef } from '../refs'
import { Helper } from '../components/Helper'

export const CATEGORY: Record<EmailCategory, { label: string; tone: string }> = {
  application: { label: 'Application', tone: 'bg-indigo-50 text-indigo-800' },
  leave: { label: 'Leave', tone: 'bg-teal-50 text-teal-800' },
  payroll: { label: 'Payroll', tone: 'bg-orange-50 text-orange-800' },
  contract: { label: 'Contract', tone: 'bg-violet-50 text-violet-800' },
  hours: { label: 'Working hours', tone: 'bg-sky-50 text-sky-800' },
  policy: { label: 'Policy', tone: 'bg-lime-50 text-lime-800' },
  documents: { label: 'Documents', tone: 'bg-pink-50 text-pink-800' },
  other: { label: 'Other', tone: 'bg-stone-100 text-stone-700' }
}

function SenderChip({ email, compact }: { email: EmailItem; compact?: boolean }): ReactNode {
  const v = email.auth?.verdict ?? 'unknown'
  if (v === 'spoofed')
    return (
      <Chip tone="danger">
        <ShieldAlert size={11} /> Spoofing suspected
      </Chip>
    )
  if (v === 'unverified')
    return (
      <Chip tone="warning">
        <ShieldAlert size={11} /> Unverified sender
      </Chip>
    )
  if (compact) return null
  if (v === 'verified')
    return (
      <Chip tone="success">
        <ShieldCheck size={11} /> Verified sender
      </Chip>
    )
  return <Chip>Not verified (imported file)</Chip>
}

// Urgent unless the sender is probably forged, so a spoofed "urgent" email can't jump the queue.
const isUrgent = (e: EmailItem): boolean => !!e.triage?.urgent && e.auth?.verdict !== 'spoofed'

const senderName = (from: string): string => from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || from
const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function EmailDetail({
  email,
  jobs,
  gmailConnected,
  go
}: {
  email: EmailItem
  jobs: JobFilter[]
  gmailConnected: boolean
  go: (r: Route) => void
}): ReactNode {
  const t = email.triage
  const [draft, setDraft] = useState(t?.draftReply ?? '')
  const [jobId, setJobId] = useState(jobs[0]?.id ?? '')
  const [status, setStatus] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [recipient, setRecipient] = useState<string | null>(null)
  const cvs = email.attachments.filter((a) => a.isCv)
  const draftLinks = email.flagsDismissed ? undefined : email.flags?.find((f) => f.code === 'draft_has_link')

  useEffect(() => {
    if (email.source === 'gmail' && gmailConnected) api.gmail.recipient(email.id).then(setRecipient, () => setRecipient(null))
  }, [email.id, email.source, gmailConnected])

  useEffect(() => {
    setDraft(email.triage?.draftReply ?? '')
    setStatus(null)
  }, [email.id, email.triage?.draftReply])

  const sendToScreening = async (): Promise<void> => {
    try {
      const n = await api.inbox.sendToScreening(email.id, jobId)
      const job = jobs.find((j) => j.id === jobId)
      setStatus(
        n > 0
          ? { tone: 'ok', text: `Sent ${n} CV${n > 1 ? 's' : ''} to “${job?.title}”. Analysis has started.` }
          : { tone: 'ok', text: `This CV is already in “${job?.title}”.` }
      )
    } catch (e) {
      setStatus({ tone: 'err', text: errorMessage(e) })
    }
  }

  const openAttachment = (i: number): void => {
    api.inbox.openAttachment(email.id, i).catch((e) => setStatus({ tone: 'err', text: errorMessage(e) }))
  }

  const sendReply = async (): Promise<void> => {
    setSending(true)
    try {
      if (await api.gmail.send(email.id, draft)) setStatus({ tone: 'ok', text: `Reply sent to ${recipient ?? 'the sender'}.` })
    } catch (e) {
      setStatus({ tone: 'err', text: errorMessage(e) })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-6">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        {t && <span className={`rounded px-1.5 py-0.5 text-xs ${CATEGORY[t.category].tone}`}>{CATEGORY[t.category].label}</span>}
        {t?.urgent && (
          <Chip tone="danger">
            <AlertTriangle size={11} /> Urgent · AI-assessed
          </Chip>
        )}
        <SenderChip email={email} />
        {email.threadCount > 1 && (
          <Chip>
            <MessagesSquare size={11} /> {email.threadCount} messages in thread
          </Chip>
        )}
      </div>
      <h2 className="text-lg font-semibold text-stone-900" dir="auto">
        {email.subject}
      </h2>
      <div className="mb-4 text-sm text-stone-500" dir="auto">
        {email.from} · {fmtDate(email.date)}
      </div>

      <SecurityFlags item={email} onDismiss={() => void api.inbox.dismissFlags(email.id)} />

      {!t && !email.triageError && (
        <div className="mb-4 flex items-center gap-2 text-sm text-stone-500">
          <Loader2 size={14} className="animate-spin" /> The assistant is reading this email…
        </div>
      )}
      {email.triageError && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          {email.triageError}
          <Button size="sm" onClick={() => api.inbox.retriage(email.id)}>
            Retry
          </Button>
        </div>
      )}

      {t && (
        <Card className="mb-4 border-accent/20 bg-accent-soft/40 p-4">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-accent">
            <Sparkles size={13} /> Summary
          </div>
          <div className="text-sm text-stone-800" dir="auto">
            {t.summary}
          </div>
          {t.urgent && t.urgencyReason && (
            <div className="mt-2 text-sm text-rose-700" dir="auto">
              Why it's urgent: {t.urgencyReason}
            </div>
          )}
        </Card>
      )}

      {t?.category === 'application' && t.missingDocuments.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Incomplete application</div>
            Missing: {t.missingDocuments.join(', ')}. Checked against the attachments. The draft reply below asks for them.
            {t.aiMissingDocuments && (
              <div className="mt-1 text-xs text-amber-800">
                The AI read it differently: {t.aiMissingDocuments.length ? t.aiMissingDocuments.join(', ') : 'nothing missing'}.
              </div>
            )}
          </div>
        </div>
      )}

      {email.attachments.length > 0 && (
        <div className="mb-4">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <Paperclip size={13} /> Attachments
          </div>
          <div className="flex flex-wrap gap-2">
            {email.attachments.map((a, i) => (
              <button
                key={`${i}-${a.fileName}`}
                onClick={() => openAttachment(i)}
                title={a.openable === false ? "This file type can't be opened from HR Assistant" : undefined}
                className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm ${
                  a.openable === false ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-stone-200 bg-white hover:bg-stone-50'
                }`}
                dir="auto"
              >
                {a.openable === false ? <ShieldAlert size={14} /> : <FileText size={14} className="text-stone-400" />} {a.fileName}
                {a.isCv && <Chip tone="accent">CV</Chip>}
              </button>
            ))}
          </div>
          {cvs.length > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-stone-50 p-2.5">
              <UserPlus size={15} className="text-accent" />
              <span className="text-sm text-stone-700">Screen this CV for</span>
              {jobs.length ? (
                <>
                  <select
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    className="rounded-md border border-stone-300 bg-white px-2 py-1 text-sm"
                  >
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.title}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" variant="primary" onClick={sendToScreening}>
                    Send to screening
                  </Button>
                  {status?.tone === 'ok' && status.text.startsWith('Sent') && (
                    <Button size="sm" variant="ghost" onClick={() => go({ page: 'job', jobId })}>
                      Open
                    </Button>
                  )}
                </>
              ) : (
                <Button size="sm" onClick={() => go({ page: 'newJob' })}>
                  Create a job filter first
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {status && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${status.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}
        >
          {status.text}
        </div>
      )}

      {t?.draftReply != null && (
        <div className="mb-5">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-stone-500">
            <Sparkles size={13} className="text-accent" /> Draft reply. Review it before sending
          </div>
          {draftLinks && (
            <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {draftLinks.detail}
              <div className="mt-0.5 font-mono text-xs break-words">{draftLinks.evidence}</div>
            </div>
          )}
          <Textarea rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="mt-2 flex items-center gap-2">
            {email.source === 'gmail' && gmailConnected ? (
              <>
                <Button variant="primary" onClick={sendReply} disabled={sending || !draft.trim()}>
                  {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send reply
                </Button>
                {recipient && (
                  <span className="text-xs text-stone-500">
                    to <span className="font-medium text-stone-800">{recipient}</span>
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-stone-500">Connect Gmail to send replies from here.</span>
            )}
            <Button variant="ghost" onClick={() => navigator.clipboard.writeText(draft)}>
              <Copy size={14} /> Copy
            </Button>
          </div>
        </div>
      )}

      <div className="mb-1.5 text-xs font-medium text-stone-500">Original message</div>
      <div className="rounded-lg border border-stone-200 bg-white p-4 text-sm whitespace-pre-wrap text-stone-700" dir="auto">
        {email.text}
      </div>
    </div>
  )
}

export default function Inbox({
  go,
  onContext,
  initialSelected
}: {
  go: (r: Route) => void
  onContext: (e: EmailItem | null) => void
  initialSelected?: string
}): ReactNode {
  const [emails, setEmails] = useState<EmailItem[] | null>(null)
  const [jobs, setJobs] = useState<JobFilter[]>([])
  const [selected, setSelected] = useState<string | null>(initialSelected ?? null)
  const [cat, setCat] = useState<EmailCategory | 'all' | 'urgent'>('all')
  const [gmail, setGmail] = useState<{ connected: boolean; user: string | null }>({ connected: false, user: null })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => void api.inbox.list().then(setEmails), [])

  useEffect(() => {
    load()
    api.jobs.list().then(setJobs)
    api.gmail.status().then(setGmail)
    const offA = api.on('emails:changed', load)
    const offB = api.on('emails:updated', (p) => {
      const e = p as EmailItem
      setEmails((prev) => (prev ? prev.map((x) => (x.id === e.id ? e : x)) : prev))
    })
    return () => {
      offA()
      offB()
    }
  }, [load])

  const current = emails?.find((e) => e.id === selected) ?? null
  useEffect(() => onContext(current), [current, onContext])
  useEffect(() => () => onContext(null), [onContext])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: emails?.length ?? 0, urgent: 0 }
    for (const e of emails ?? []) {
      if (isUrgent(e)) c.urgent++
      if (e.triage) c[e.triage.category] = (c[e.triage.category] ?? 0) + 1
    }
    return c
  }, [emails])

  if (!emails) return null

  const visible = emails
    .filter((e) => (cat === 'all' ? true : cat === 'urgent' ? isUrgent(e) : e.triage?.category === cat))
    .sort((a, b) => Number(isUrgent(b)) - Number(isUrgent(a)) || b.date.localeCompare(a.date))
  const pending = emails.filter((e) => !e.triage && !e.triageError).length

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const filterChip = (key: typeof cat, label: string): ReactNode =>
    (counts[key] ?? 0) > 0 || key === 'all' ? (
      <button
        key={key}
        onClick={() => setCat(key)}
        className={`cursor-pointer rounded-full px-2.5 py-1 text-xs transition ${
          cat === key ? 'bg-stone-900 text-white' : 'bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50'
        }`}
      >
        {label} <span className="opacity-60">{counts[key] ?? 0}</span>
      </button>
    ) : null

  return (
    <div className="-mx-10 -my-8 flex h-[calc(100%+4rem)] flex-col">
      <div className="border-b border-stone-200 px-6 pt-5 pb-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-stone-900">Inbox</h1>
            <div className="text-sm text-stone-500">
              {gmail.connected ? `Connected to ${gmail.user}` : 'Not connected to Gmail'}
              {pending > 0 && <span className="text-accent"> · sorting {pending} emails…</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {gmail.connected ? (
              <Button variant="primary" disabled={busy} onClick={() => run(api.gmail.refresh)}>
                <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> Refresh
              </Button>
            ) : (
              <Button onClick={() => go({ page: 'accounts' })}>Connect Gmail</Button>
            )}
            <Button variant={gmail.connected ? 'secondary' : 'primary'} disabled={busy} onClick={() => run(api.inbox.loadDemo)}>
              <FolderOpen size={14} /> Load emails from folder
            </Button>
          </div>
        </div>
        {error && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
        <div className="flex flex-wrap gap-1.5">
          {filterChip('all', 'All')}
          {filterChip('urgent', 'Urgent')}
          {(Object.keys(CATEGORY) as EmailCategory[]).map((k) => filterChip(k, CATEGORY[k].label))}
        </div>
      </div>

      {emails.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
          <div className="mb-3">
            <Helper size={56} mood="happy" />
          </div>
          <div className="text-base font-semibold">Let the assistant sort your HR inbox</div>
          <div className="mt-1 max-w-sm text-sm text-stone-500">
            Connect Gmail, or load a folder of saved emails. Each email gets a category, an urgency check, a summary and a draft
            reply for you to review.
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div className="w-[340px] shrink-0 overflow-y-auto border-r border-stone-200 bg-white">
            {visible.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected(e.id)}
                className={`block w-full cursor-pointer border-b border-stone-100 px-4 py-3 text-left transition ${
                  selected === e.id ? 'bg-accent-soft/60' : 'hover:bg-stone-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-stone-900" dir="auto">
                    {senderName(e.from)}
                  </span>
                  <span className="tabular shrink-0 text-xs text-stone-400">
                    {mailRef(e.id)} · {fmtDate(e.date)}
                  </span>
                </div>
                <div className="truncate text-sm text-stone-700" dir="auto">
                  {e.subject}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-stone-500" dir="auto">
                  {e.triage?.summary ?? (e.triageError ? 'Could not analyze this email' : 'Analyzing…')}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <NeedsReviewChip item={e} />
                  <SenderChip email={e} compact />
                  {e.triage?.urgent && (
                    <Chip tone="danger">
                      <AlertTriangle size={11} /> Urgent
                    </Chip>
                  )}
                  {e.triage && (
                    <span className={`rounded px-1.5 py-0.5 text-xs ${CATEGORY[e.triage.category].tone}`}>
                      {CATEGORY[e.triage.category].label}
                    </span>
                  )}
                  {e.triage && e.triage.missingDocuments.length > 0 && <Chip tone="warning">Missing documents</Chip>}
                  {e.attachments.some((a) => a.isCv) && <Chip tone="accent">CV attached</Chip>}
                </div>
              </button>
            ))}
          </div>
          {current ? (
            <EmailDetail key={current.id} email={current} jobs={jobs} gmailConnected={gmail.connected} go={go} />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-stone-400">Select an email</div>
          )}
        </div>
      )}
    </div>
  )
}
