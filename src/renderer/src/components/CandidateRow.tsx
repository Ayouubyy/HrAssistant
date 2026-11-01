import type { ReactNode } from 'react'
import { AlertTriangle, Check, Eye, Loader2, RotateCcw, ScanSearch, Star, X } from 'lucide-react'
import type { RankedCandidate } from '@shared/scoring'
import type { Candidate, HrDecision, JobFilter } from '@shared/types'
import { Button, Chip } from './ui'
import { NeedsReviewChip } from './SecurityFlags'
import { cvRef } from '../refs'

export function scoreColor(score: number, threshold: number): string {
  if (score >= Math.max(threshold + 15, 75)) return 'text-emerald-700'
  if (score >= threshold) return 'text-stone-900'
  return 'text-rose-700'
}

export function displayName(c: Candidate, label: string): string {
  return c.revealed && c.analysis?.identity.name ? c.analysis.identity.name : label
}

const decisionStyle: Record<Exclude<HrDecision, null>, string> = {
  shortlist: 'bg-emerald-600 text-white border-emerald-600',
  maybe: 'bg-amber-500 text-white border-amber-500',
  reject: 'bg-rose-600 text-white border-rose-600'
}

export function RankedRow({
  c,
  rank,
  label,
  job,
  onOpen,
  onDecide,
  onRestore,
  onReveal,
  onRetry,
  onCredibility
}: {
  c: RankedCandidate
  rank: number | null
  label: string
  job: JobFilter
  onOpen: () => void
  onDecide: (d: HrDecision) => void
  onRestore: () => void
  onReveal: () => void
  onRetry: () => void
  onCredibility?: () => void
}): ReactNode {
  const a = c.analysis!
  const missingMust = job.requirements.filter(
    (q) => q.mustHave && a.requirements.some((x) => x.requirementId === q.id && x.status === 'not_met')
  )
  const decisionBtn = (d: Exclude<HrDecision, null>, icon: ReactNode, text: string): ReactNode => (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onDecide(c.hrDecision === d ? null : d)
      }}
      className={`flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition ${
        c.hrDecision === d ? decisionStyle[d] : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
      }`}
    >
      {icon}
      {text}
    </button>
  )

  return (
    <div
      onClick={onOpen}
      className="grid cursor-pointer grid-cols-[44px_56px_minmax(0,1fr)_auto] items-start gap-3 border-t border-stone-100 px-4 py-3 transition hover:bg-stone-50"
    >
      <div className="pt-0.5 text-sm text-stone-400 tabular-nums">{rank ? `#${rank}` : ''}</div>
      <div className={`text-2xl leading-none font-semibold tabular-nums ${scoreColor(c.score, job.threshold)}`}>
        {c.score}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="tabular text-xs font-medium text-stone-500">{cvRef(Number(label.match(/\d+/)?.[0] ?? 0))}</span>
          <span className="font-medium text-stone-900" dir="auto">
            {displayName(c, label)}
          </span>
          {!c.revealed && a.identity.name && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onReveal()
              }}
              className="flex cursor-pointer items-center gap-0.5 text-xs text-stone-400 hover:text-accent"
            >
              <Eye size={12} /> Show name
            </button>
          )}
          {a.languages.length > 0 && <span className="text-xs text-stone-400">{a.languages.slice(0, 3).join(' · ')}</span>}
          {c.source === 'email' && <Chip tone="accent">From inbox</Chip>}
          <NeedsReviewChip item={c} />
          {c.rescreen === 'running' && (
            <span className="flex items-center gap-1 text-xs text-progress">
              <Loader2 size={11} className="animate-spin" /> Re-screening
            </span>
          )}
        </div>
        {c.rescreen === 'failed' && (
          <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-600" onClick={(e) => e.stopPropagation()}>
            <AlertTriangle size={11} /> Re-screen failed, showing the previous result.
            <button onClick={onRetry} className="cursor-pointer font-medium text-accent hover:underline">
              Retry
            </button>
          </div>
        )}
        <div className={`mt-0.5 text-sm ${c.rejected ? 'text-rose-700' : 'text-stone-600'}`} dir="auto">
          {c.suggested && <span className="mr-1.5 font-medium">Suggested ·</span>}
          {c.rejected ? c.reason : a.verdict}
        </div>
        {c.note && (
          <div className="mt-0.5 text-xs text-stone-500" dir="auto">
            {c.note}
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1">
          {a.matchedSkills.slice(0, 5).map((s) => (
            <Chip key={s} tone="success">
              {s}
            </Chip>
          ))}
          {missingMust.map((q) => (
            <Chip key={q.id} tone="danger">
              No: {q.text}
            </Chip>
          ))}
          {a.redFlags.length > 0 && (
            <Chip tone="warning">
              <AlertTriangle size={11} /> {a.redFlags.length} flag{a.redFlags.length > 1 ? 's' : ''}
            </Chip>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
        {c.suggested ? (
          <>
            <Button size="sm" onClick={onRestore}>
              <RotateCcw size={12} /> Keep
            </Button>
            <Button size="sm" variant="danger" onClick={() => onDecide('reject')}>
              <X size={12} /> Confirm
            </Button>
          </>
        ) : c.rejected ? (
          <Button size="sm" onClick={onRestore}>
            <RotateCcw size={12} /> Restore
          </Button>
        ) : (
          <>
            {c.hrDecision === 'shortlist' && onCredibility && (
              // Not built yet: the button looks like the others, the tooltip and the page it opens say so.
              <span className="group/cred relative mr-1">
                <button
                  onClick={onCredibility}
                  aria-describedby={`cred-${c.id}`}
                  className="flex cursor-pointer items-center gap-1 rounded-md border border-accent/40 bg-accent-soft px-2 py-1 text-xs font-medium text-accent transition hover:border-accent hover:bg-accent hover:text-white"
                >
                  <ScanSearch size={12} /> Check credibility
                </button>
                <span
                  id={`cred-${c.id}`}
                  role="tooltip"
                  className="pointer-events-none absolute right-0 bottom-full z-10 mb-1.5 rounded-[3px] bg-stone-900 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white opacity-0 transition-opacity group-focus-within/cred:opacity-100 group-hover/cred:opacity-100"
                >
                  Coming soon · click to see what it will do
                </span>
              </span>
            )}
            {decisionBtn('shortlist', <Star size={12} />, 'Shortlist')}
            {decisionBtn('maybe', <Check size={12} />, 'Maybe')}
            {decisionBtn('reject', <X size={12} />, 'Reject')}
          </>
        )}
      </div>
    </div>
  )
}

export function PendingRow({ c, onRetry }: { c: Candidate; onRetry: () => void }): ReactNode {
  return (
    <div className="flex items-center gap-3 border-t border-stone-100 px-4 py-2.5 text-sm">
      {c.status === 'error' ? (
        <AlertTriangle size={15} className="text-rose-600" />
      ) : (
        <Loader2 size={15} className="animate-spin text-stone-400" />
      )}
      <span className="min-w-0 flex-1 truncate text-stone-700">{c.fileName}</span>
      {c.status === 'error' ? (
        <>
          <span className="truncate text-xs text-rose-700">{c.error}</span>
          <Button size="sm" onClick={onRetry}>
            <RotateCcw size={12} /> Retry
          </Button>
        </>
      ) : (
        <span className="text-xs text-stone-400">{c.status === 'processing' ? 'Analyzing…' : 'Waiting…'}</span>
      )}
    </div>
  )
}
