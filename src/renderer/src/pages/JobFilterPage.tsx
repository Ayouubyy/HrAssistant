import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Archive, ArchiveRestore, Download, Pencil, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { needsReview } from '@shared/flags'
import { PRESETS } from '@shared/presets'
import { rankCandidates, type RankedCandidate } from '@shared/scoring'
import type { Candidate, JobFilter, Weights } from '@shared/types'
import { api, errorMessage } from '../api'
import type { AssistantFilter, Route } from '../App'
import CandidateDetail from '../components/CandidateDetail'
import { PendingRow, RankedRow } from '../components/CandidateRow'
import { Button, Card, Chip, Toggle } from '../components/ui'

type Tab = 'ranked' | 'rejected' | 'shortlist' | 'review'

function Slider({
  label,
  value,
  max,
  step = 1,
  onChange
}: {
  label: string
  value: number
  max: number
  step?: number
  onChange: (v: number) => void
}): ReactNode {
  return (
    <label className="grid grid-cols-[80px_1fr_28px] items-center gap-2 text-xs text-stone-600">
      {label}
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[#1f4e5f]"
      />
      <span className="text-right font-medium text-stone-900 tabular-nums">{value}</span>
    </label>
  )
}

function applyAssistantFilter(list: RankedCandidate[], f: AssistantFilter | null): RankedCandidate[] {
  if (!f) return list
  return list.filter((c) => {
    if (f.ids && f.ids.length && !f.ids.includes(c.id)) return false
    if (f.minYears != null && (c.analysis?.yearsExperience ?? 0) < f.minYears) return false
    if (f.skills && f.skills.length) {
      const hay = [...(c.analysis?.matchedSkills ?? []), c.analysis?.verdict ?? ''].join(' ').toLowerCase()
      if (!f.skills.every((s) => hay.includes(s.toLowerCase()))) return false
    }
    return true
  })
}

export default function JobFilterPage({
  jobId,
  go,
  onContext,
  assistantFilter,
  clearAssistantFilter,
  initialOpenId
}: {
  initialOpenId?: string
  jobId: string
  go: (r: Route) => void
  onContext: (job: JobFilter | null, candidates: Candidate[]) => void
  assistantFilter: AssistantFilter | null
  clearAssistantFilter: () => void
}): ReactNode {
  const [job, setJob] = useState<JobFilter | null>(null)
  const [cands, setCands] = useState<Candidate[]>([])
  const [tab, setTab] = useState<Tab>('ranked')
  const [openId, setOpenId] = useState<string | null>(initialOpenId ?? null)
  const [dragging, setDragging] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    setJob(null)
    api.jobs.get(jobId).then(setJob)
    api.candidates.list(jobId).then(setCands)
    const offRemoved = api.on('candidates:removed', (p) => {
      const r = p as { id: string; jobId: string }
      if (r.jobId === jobId) setCands((prev) => prev.filter((c) => c.id !== r.id))
    })
    const offUpdated = api.on('candidates:updated', (p) => {
      const c = p as Candidate
      if (c.jobId !== jobId) return
      setCands((prev) => {
        const i = prev.findIndex((x) => x.id === c.id)
        if (i === -1) return [...prev, c]
        const next = prev.slice()
        next[i] = c
        return next
      })
    })
    return () => {
      offRemoved()
      offUpdated()
    }
  }, [jobId])

  useEffect(() => {
    onContext(job, cands)
  }, [job, cands, onContext])
  useEffect(() => () => onContext(null, []), [onContext])

  const labels = useMemo(() => new Map(cands.map((c, i) => [c.id, `Candidate ${i + 1}`])), [cands])
  const ranked = useMemo(() => (job ? rankCandidates(cands, job) : null), [cands, job])

  useEffect(() => {
    if (!assistantFilter || !ranked) return
    const inRanked = applyAssistantFilter(ranked.ranked, assistantFilter).length
    const inRejected = applyAssistantFilter(ranked.rejected, assistantFilter).length
    setTab(inRanked === 0 && inRejected > 0 ? 'rejected' : 'ranked')
    // Only when a new filter arrives, not on every re-rank.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantFilter])

  if (!job || !ranked) return null

  const update = (patch: Partial<JobFilter>): void => {
    const next = { ...job, ...patch }
    setJob(next)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => api.jobs.save(next), 400)
  }
  const setWeight = (k: keyof Weights, v: number): void => update({ weights: { ...job.weights, [k]: v } })
  const patchCand = (id: string, patch: Partial<Candidate>): void => {
    setCands((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)))
    void api.candidates.update(id, patch)
  }

  const addPaths = async (paths: string[]): Promise<void> => {
    if (paths.length) await api.candidates.add(jobId, paths)
  }
  const onDrop = (e: DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    void addPaths([...e.dataTransfer.files].map((f) => api.pathForFile(f)))
  }

  const done = cands.filter((c) => c.status === 'done').length
  const working = cands.filter((c) => c.status === 'pending' || c.status === 'processing').length
  const shortlisted = [...ranked.ranked, ...ranked.rejected].filter((c) => c.hrDecision === 'shortlist')
  const review = [...ranked.ranked, ...ranked.rejected].filter((c) => needsReview(c))
  const lists: Record<Tab, RankedCandidate[]> = {
    ranked: applyAssistantFilter(ranked.ranked, assistantFilter),
    rejected: applyAssistantFilter(ranked.rejected, assistantFilter),
    shortlist: applyAssistantFilter(shortlisted, assistantFilter),
    review: applyAssistantFilter(review, assistantFilter)
  }
  const list = lists[tab]
  const open = openId ? [...ranked.ranked, ...ranked.rejected].find((c) => c.id === openId) : null

  const tabBtn = (t: Tab, text: string, n: number): ReactNode => (
    <button
      onClick={() => setTab(t)}
      className={`cursor-pointer rounded-md px-3 py-1.5 text-sm transition ${
        tab === t ? 'bg-white font-medium text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-800'
      }`}
    >
      {text} <span className="text-stone-400 tabular-nums">{n}</span>
    </button>
  )

  return (
    <div
      className="mx-auto max-w-5xl"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={onDrop}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.02em] text-stone-900" dir="auto">
            {job.title}
          </h1>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-stone-500">
            <Chip>{PRESETS[job.preset].label}</Chip>
            {job.closedAt && <Chip tone="warning">Closed</Chip>}
            <span>
              {cands.length} CVs · {done} analyzed
              {working > 0 && <span className="text-accent"> · analyzing {working}…</span>}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" onClick={() => go({ page: 'editJob', jobId })}>
            <Pencil size={14} /> Edit
          </Button>
          <Button
            variant="ghost"
            disabled={done === 0 || working > 0}
            title="Analyse every CV of this job again with the current AI settings"
            onClick={() => {
              if (confirm(`Analyse all ${cands.length} CVs again? Your shortlist and decisions are kept.`)) void api.jobs.rescreen(jobId)
            }}
          >
            <RotateCcw size={14} /> Re-screen
          </Button>
          <Button
            variant="ghost"
            title={job.closedAt ? 'Reopen this job' : 'Close this job (its candidates can then be deleted automatically, see Settings)'}
            onClick={() => update({ closedAt: job.closedAt ? undefined : new Date().toISOString() })}
          >
            {job.closedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />} {job.closedAt ? 'Reopen' : 'Close'}
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              if (confirm(`Delete "${job.title}" and its ${cands.length} candidates?`)) {
                await api.jobs.remove(jobId)
                go({ page: 'jobs' })
              }
            }}
          >
            <Trash2 size={14} />
          </Button>
          <Button onClick={() => api.candidates.exportCsv(jobId)} disabled={done === 0}>
            <Download size={14} /> Export
          </Button>
          <Button variant="primary" onClick={async () => addPaths(await api.candidates.pickFiles())}>
            <Upload size={14} /> Add CVs
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 text-stone-500">Must-have</span>
        {job.requirements
          .filter((r) => r.mustHave)
          .map((r) => (
            <Chip key={r.id} tone="accent">
              {r.text}
            </Chip>
          ))}
        <span className="mr-1 ml-3 text-stone-500">Nice to have</span>
        {job.requirements
          .filter((r) => !r.mustHave)
          .map((r) => (
            <Chip key={r.id}>{r.text}</Chip>
          ))}
      </div>

      <Card className="mb-4 p-4">
        <div className="mb-1 text-xs font-medium text-stone-500">What matters most for this role</div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2">
          <Slider label="Skills" value={job.weights.skills} max={10} onChange={(v) => setWeight('skills', v)} />
          <Slider label="Experience" value={job.weights.experience} max={10} onChange={(v) => setWeight('experience', v)} />
          <Slider label="Education" value={job.weights.education} max={10} onChange={(v) => setWeight('education', v)} />
          <Slider label="Languages" value={job.weights.languages} max={10} onChange={(v) => setWeight('languages', v)} />
        </div>
        <div className="mt-3 grid grid-cols-2 items-center gap-x-8 gap-y-2 border-t border-stone-100 pt-3">
          <Slider label="Threshold" value={job.threshold} max={100} step={5} onChange={(v) => update({ threshold: v })} />
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
          <Toggle
            checked={job.autoRejectMissingMustHave}
            onChange={(v) => update({ autoRejectMissingMustHave: v })}
            label="Auto-reject if a must-have is missing"
          />
          <Toggle
            checked={job.autoRejectBelowThreshold}
            onChange={(v) => update({ autoRejectBelowThreshold: v })}
            label="Auto-reject below threshold"
          />
          </div>
        </div>
      </Card>

      {cands.length === 0 ? (
        <div
          className={`flex flex-col items-center rounded-md border-2 border-dashed px-8 py-16 text-center transition ${
            dragging ? 'border-accent bg-accent-soft' : 'border-stone-300 bg-white'
          }`}
        >
          <Upload size={26} className="mb-3 text-stone-400" />
          <div className="text-base font-semibold">Drop CVs here</div>
          <div className="mt-1 text-sm text-stone-500">PDF or Word, in French, English or Arabic. As many as you like.</div>
          <Button variant="primary" className="mt-4" onClick={async () => addPaths(await api.candidates.pickFiles())}>
            Choose files
          </Button>
        </div>
      ) : (
        <Card className={`overflow-hidden ${dragging ? 'ring-2 ring-accent' : ''}`}>
          <div className="flex items-center justify-between bg-stone-50 px-3 py-2">
            <div className="flex gap-1 rounded-lg bg-stone-200/50 p-0.5">
              {tabBtn('ranked', 'Ranked', lists.ranked.length)}
              {tabBtn('rejected', 'Rejected', lists.rejected.length)}
              {tabBtn('shortlist', 'Shortlist', lists.shortlist.length)}
              {lists.review.length > 0 && tabBtn('review', 'Needs review', lists.review.length)}
            </div>
            {dragging && <span className="text-sm text-accent">Drop to add CVs</span>}
            {assistantFilter && (
              <button
                onClick={clearAssistantFilter}
                className="flex cursor-pointer items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-xs text-accent"
              >
                Assistant filter: {assistantFilter.label} <X size={12} />
              </button>
            )}
          </div>
          {list.map((c, i) => (
            <RankedRow
              key={c.id}
              c={c}
              rank={tab === 'ranked' ? i + 1 : null}
              label={labels.get(c.id)!}
              job={job}
              onOpen={() => setOpenId(c.id)}
              onDecide={(d) => patchCand(c.id, { hrDecision: d, restored: d === 'reject' ? false : c.restored })}
              onRestore={() => patchCand(c.id, { restored: true, hrDecision: null })}
              onReveal={() => patchCand(c.id, { revealed: true })}
            />
          ))}
          {list.length === 0 && ranked.pending.length === 0 && (
            <div className="border-t border-stone-100 px-4 py-8 text-center text-sm text-stone-500">
              {tab === 'shortlist'
                ? 'Shortlist candidates to see them here.'
                : tab === 'review'
                  ? 'Nothing needs a security review.'
                  : 'No candidates here.'}
            </div>
          )}
          {tab === 'ranked' && ranked.pending.map((c) => (
            <PendingRow key={c.id} c={c} onRetry={() => api.candidates.retry(c.id)} />
          ))}
        </Card>
      )}

      {open && (
        <CandidateDetail
          c={open}
          label={labels.get(open.id)!}
          job={job}
          onClose={() => setOpenId(null)}
          onOpenCv={() => api.candidates.open(open.id).catch((e) => alert(errorMessage(e)))}
          onDismissFlags={() => patchCand(open.id, { flagsDismissed: true })}
          onDelete={() => {
            setOpenId(null)
            void api.candidates.remove(open.id)
          }}
        />
      )}
    </div>
  )
}
