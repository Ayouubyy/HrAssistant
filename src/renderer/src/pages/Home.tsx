import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, FolderOpen, Plus } from 'lucide-react'
import { addressOf, displayNameOf } from '@shared/address'
import { needsReview } from '@shared/flags'
import { rankCandidates } from '@shared/scoring'
import type { Candidate, EmailItem, JobFilter } from '@shared/types'
import { api } from '../api'
import type { Route } from '../App'
import { Helper } from '../components/Helper'
import { Mark, type MarkKind } from '../components/Mark'
import { cvRef, mailRef } from '../refs'
import { Button } from '../components/ui'

type Figure = 'review' | 'decide' | 'progress' | 'urgent'

interface Row {
  key: string
  figure: Figure
  mark: MarkKind
  ref: string
  item: string
  where: string
  status: string
  go: Route
  order: number
}

const isUrgent = (e: EmailItem): boolean => !!e.triage?.urgent && e.auth?.verdict !== 'spoofed'

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

const firstHigh = (flags: { severity: string; detail: string }[] | undefined): string =>
  flags?.find((f) => f.severity === 'high')?.detail ?? 'Security check raised a flag'

export default function Home({ go }: { go: (r: Route) => void }): ReactNode {
  const [jobs, setJobs] = useState<JobFilter[] | null>(null)
  const [cands, setCands] = useState<Record<string, Candidate[]>>({})
  const [emails, setEmails] = useState<EmailItem[]>([])
  const [figure, setFigure] = useState<Figure | null>(null)
  const [freeTierOk, setFreeTierOk] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const load = useCallback(async () => {
    const js = await api.jobs.list()
    const lists = await Promise.all(js.map((j) => api.candidates.list(j.id)))
    setJobs(js)
    setCands(Object.fromEntries(js.map((j, i) => [j.id, lists[i]])))
    setEmails(await api.inbox.list())
    setFreeTierOk((await api.settings.get()).freeTierAcknowledged)
  }, [])

  useEffect(() => {
    void load()
    const soon = (): void => {
      clearTimeout(timer.current)
      timer.current = setTimeout(() => void load(), 250)
    }
    const offs = ['candidates:updated', 'candidates:removed', 'jobs:changed', 'emails:updated', 'emails:changed'].map((e) =>
      api.on(e, soon)
    )
    return () => {
      clearTimeout(timer.current)
      offs.forEach((off) => off())
    }
  }, [load])

  const rows = useMemo(() => {
    const out: Row[] = []
    for (const job of jobs ?? []) {
      const list = cands[job.id] ?? []
      const label = new Map(list.map((c, i) => [c.id, i + 1]))
      const { ranked, rejected } = rankCandidates(list, job)
      for (const c of list) {
        const n = label.get(c.id)!
        const base = { ref: cvRef(n), where: job.title, go: { page: 'job', jobId: job.id, candidateId: c.id } as Route }
        const name = c.revealed && c.analysis?.identity.name ? c.analysis.identity.name : `Candidate ${n}`
        if (c.status === 'pending' || c.status === 'processing')
          out.push({ ...base, key: c.id, figure: 'progress', mark: 'progress', item: c.fileName, status: 'Analysing', order: 4 })
        else if (needsReview(c))
          out.push({ ...base, key: c.id, figure: 'review', mark: 'needs', item: name, status: firstHigh(c.flags), order: 0 })
      }
      for (const c of ranked.filter((x) => !x.hrDecision && !needsReview(x))) {
        const n = label.get(c.id)!
        out.push({
          key: c.id,
          figure: 'decide',
          mark: 'ready',
          ref: cvRef(n),
          item: c.revealed && c.analysis?.identity.name ? c.analysis.identity.name : `Candidate ${n}`,
          where: job.title,
          status: `Score ${c.score} · ready for your decision`,
          go: { page: 'job', jobId: job.id, candidateId: c.id },
          order: 3 + (100 - c.score) / 1000
        })
      }
      // A rule's suggestion is still HR's decision to make.
      for (const c of rejected.filter((x) => x.suggested && !needsReview(x))) {
        const n = label.get(c.id)!
        out.push({
          key: c.id,
          figure: 'decide',
          mark: 'look',
          ref: cvRef(n),
          item: c.revealed && c.analysis?.identity.name ? c.analysis.identity.name : `Candidate ${n}`,
          where: job.title,
          status: `Suggested rejection · ${c.reason}`,
          go: { page: 'job', jobId: job.id, candidateId: c.id },
          order: 3.5
        })
      }
    }
    for (const e of emails) {
      const base = { key: e.id, ref: mailRef(e.id), item: e.subject, where: displayNameOf(e.from) || addressOf(e.from), go: { page: 'inbox', emailId: e.id } as Route }
      if (needsReview(e)) out.push({ ...base, figure: 'review', mark: 'needs', status: firstHigh(e.flags), order: 1 })
      else if (isUrgent(e)) out.push({ ...base, figure: 'urgent', mark: 'look', status: e.triage?.urgencyReason || 'Urgent', order: 2 })
      else if (!e.triage && !e.triageError) out.push({ ...base, figure: 'progress', mark: 'progress', status: 'Sorting', order: 4 })
    }
    return out.sort((a, b) => a.order - b.order)
  }, [jobs, cands, emails])

  if (!jobs) return null

  const count = (f: Figure): number => rows.filter((r) => r.figure === f).length
  const undecided = count('decide')
  const figures: { id: Figure; value: number; label: string; note: string }[] = [
    { id: 'review', value: count('review'), label: 'Need review', note: 'Flagged by a security check' },
    { id: 'decide', value: undecided, label: 'Awaiting your decision', note: 'Ranked, or a suggested rejection' },
    { id: 'urgent', value: count('urgent'), label: 'Urgent emails', note: 'AI-assessed, verified senders' },
    { id: 'progress', value: count('progress'), label: 'In progress', note: 'CVs and emails being read' }
  ]
  const visible = figure ? rows.filter((r) => r.figure === figure) : rows.slice(0, 12)

  const allCands = Object.values(cands).flat()
  const done = allCands.filter((c) => c.status === 'done')
  const ledger: [string, number][] = [
    ['CVs checked', done.length],
    ['Hidden text or injection found', done.filter((c) => c.flags?.some((f) => f.severity === 'high' && ['hidden_text', 'injection_phrase', 'model_reported_injection'].includes(f.code))).length],
    ['Active content or malware', allCands.filter((c) => c.flags?.some((f) => f.code === 'active_content' || f.code === 'malware')).length],
    ['Emails from verified senders', emails.filter((e) => e.auth?.verdict === 'verified').length],
    ['Unverified or spoofed senders', emails.filter((e) => e.auth?.verdict === 'unverified' || e.auth?.verdict === 'spoofed').length],
    ['Unsafe attachments held back', emails.reduce((n, e) => n + e.attachments.filter((a) => a.openable === false).length, 0)]
  ]
  const needs = count('review')
  const status =
    rows.length === 0
      ? 'Nothing waits on you. Add a job filter or load emails to start.'
      : needs > 0
        ? `${needs} item${needs > 1 ? 's' : ''} need${needs > 1 ? '' : 's'} your review. I've sorted the rest; every decision is yours.`
        : "I've sorted everything. Every decision is yours."

  return (
    <div className="mx-auto max-w-[1080px]">
      <div className="flex items-center gap-4 pb-7">
        <Helper size={60} mood={needs > 0 ? 'idle' : 'happy'} title="Nour, your HR assistant" />
        <div className="min-w-0">
          <h1 className="text-[30px] leading-tight font-semibold tracking-[-0.025em] text-stone-900">{greeting()}.</h1>
          <p className="mt-0.5 text-[15px] text-stone-600">{status}</p>
        </div>
      </div>

      {!freeTierOk && (
        <div className="mb-5 flex items-center gap-3 border-l-2 border-accent bg-accent-soft px-3 py-2 text-sm text-stone-800">
          <span className="flex-1">
            On Google’s free Gemini tier, CV and email text you send may be used to improve Google’s products. Use demo data
            only, or a paid key.
          </span>
          <button
            className="cursor-pointer text-sm font-medium text-accent hover:underline"
            onClick={() => void api.settings.save({ freeTierAcknowledged: true }).then(() => setFreeTierOk(true))}
          >
            I understand
          </button>
        </div>
      )}

      <div className="grid grid-cols-4 border-y border-stone-900">
        {figures.map((f, i) => {
          const active = figure === f.id
          return (
            <button
              key={f.id}
              onClick={() => setFigure(active ? null : f.id)}
              aria-pressed={active}
              className={`cursor-pointer px-5 py-4 text-left transition-colors ${i > 0 ? 'border-l border-stone-300' : ''} ${
                active ? 'bg-white' : 'hover:bg-white/60'
              }`}
            >
              <div
                className={`tabular text-[56px] leading-none font-semibold tracking-[-0.03em] ${
                  f.id === 'review' && f.value > 0 ? 'text-needs' : f.id === 'progress' && f.value > 0 ? 'text-progress' : 'text-stone-900'
                }`}
              >
                {f.value}
              </div>
              <div className="mt-2 text-sm font-semibold text-stone-900">{f.label}</div>
              <div className="text-xs text-stone-500">{f.note}</div>
            </button>
          )
        })}
      </div>

      <section className="mt-9">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-[-0.01em] text-stone-900">
            {figure ? figures.find((f) => f.id === figure)!.label : 'Work queue'}
          </h2>
          {figure && (
            <button onClick={() => setFigure(null)} className="cursor-pointer text-sm text-accent hover:underline">
              Show all
            </button>
          )}
        </div>
        {rows.length === 0 ? (
          <div className="flex items-center gap-5 border-t border-stone-300 py-8">
            <Helper size={48} mood="happy" />
            <div className="flex-1 text-sm text-stone-600">
              Create a job filter and drop CVs, or load a folder of emails. I’ll sort them and bring back only what needs you.
            </div>
            <Button variant="primary" onClick={() => go({ page: 'newJob' })}>
              <Plus size={14} /> New job filter
            </Button>
            <Button onClick={() => go({ page: 'inbox' })}>
              <FolderOpen size={14} /> Open inbox
            </Button>
          </div>
        ) : (
          <div role="table" aria-label="Work queue" className="border-t border-stone-900">
            <div
              role="row"
              className="grid grid-cols-[28px_84px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.6fr)_88px] border-b border-stone-300 py-2 text-[11px] font-semibold tracking-wide text-stone-500 uppercase"
            >
              <span role="columnheader" />
              <span role="columnheader">Ref</span>
              <span role="columnheader">Item</span>
              <span role="columnheader">Where</span>
              <span role="columnheader">Status</span>
              <span role="columnheader" />
            </div>
            {visible.map((r) => (
              <div
                role="row"
                key={`${r.figure}-${r.key}`}
                className="group grid grid-cols-[28px_84px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.6fr)_88px] items-center border-b border-stone-200 py-2.5 text-sm"
              >
                <span role="cell">
                  <Mark kind={r.mark} />
                </span>
                <span role="cell" className="tabular text-xs font-medium text-stone-500">
                  {r.ref}
                </span>
                <span role="cell" className="truncate pr-4 font-medium text-stone-900" dir="auto">
                  {r.item}
                </span>
                <span role="cell" className="truncate pr-4 text-stone-600" dir="auto">
                  {r.where}
                </span>
                <span
                  role="cell"
                  className={`truncate pr-4 ${r.mark === 'needs' ? 'text-needs' : r.mark === 'progress' ? 'text-progress' : 'text-stone-700'}`}
                  dir="auto"
                >
                  {r.status}
                </span>
                <span role="cell" className="text-right">
                  <button
                    onClick={() => go(r.go)}
                    className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-accent hover:underline"
                  >
                    {r.mark === 'needs' ? 'Review' : 'Open'} <ArrowRight size={13} />
                  </button>
                </span>
              </div>
            ))}
            {!figure && rows.length > visible.length && (
              <div className="py-2 text-xs text-stone-500">
                {rows.length - visible.length} more. Pick a figure above to see them.
              </div>
            )}
            {figure && visible.length === 0 && <div className="py-6 text-sm text-stone-500">Nothing here right now.</div>}
          </div>
        )}
      </section>

      <div className="mt-10 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-10">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-stone-900">Job filters</h2>
            <button onClick={() => go({ page: 'newJob' })} className="cursor-pointer text-sm text-accent hover:underline">
              New job filter
            </button>
          </div>
          <div className="border-t border-stone-900">
            <div className="grid grid-cols-[minmax(0,1fr)_64px_64px_84px] border-b border-stone-300 py-2 text-[11px] font-semibold tracking-wide text-stone-500 uppercase">
              <span>Role</span>
              <span className="text-right">CVs</span>
              <span className="text-right">Ranked</span>
              <span className="text-right">Shortlist</span>
            </div>
            {jobs.length === 0 && <div className="py-4 text-sm text-stone-500">No job filters yet.</div>}
            {jobs.map((j) => {
              const list = cands[j.id] ?? []
              const r = rankCandidates(list, j)
              return (
                <button
                  key={j.id}
                  onClick={() => go({ page: 'job', jobId: j.id })}
                  className="tabular grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_64px_64px_84px] items-baseline border-b border-stone-200 py-2.5 text-left text-sm hover:bg-white/60"
                >
                  <span className="truncate pr-3 font-medium text-stone-900" dir="auto">
                    {j.title}
                    {j.closedAt && <span className="ml-2 text-xs font-normal text-stone-500">closed</span>}
                  </span>
                  <span className="text-right text-stone-700">{list.length}</span>
                  <span className="text-right text-stone-700">{r.ranked.length}</span>
                  <span className="text-right text-stone-700">{list.filter((c) => c.hrDecision === 'shortlist').length}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-semibold tracking-[-0.01em] text-stone-900">Security ledger</h2>
          <div className="border-t border-stone-900">
            {ledger.map(([label, n]) => (
              <div key={label} className="flex items-baseline justify-between border-b border-stone-200 py-2 text-sm">
                <span className="text-stone-700">{label}</span>
                <span className="tabular font-semibold text-stone-900">{n}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-stone-500">
            Checks run on this computer before anything reaches the AI. Flags never reject anyone or change a score.
          </p>
        </section>
      </div>
    </div>
  )
}
