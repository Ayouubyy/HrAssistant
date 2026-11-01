import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, CircleHelp, ExternalLink, Trash2, X, XCircle } from 'lucide-react'
import type { RankedCandidate } from '@shared/scoring'
import type { JobFilter } from '@shared/types'
import { Button, Chip } from './ui'
import { displayName, scoreColor } from './CandidateRow'
import { SecurityFlags } from './SecurityFlags'

const statusIcon = {
  met: <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />,
  not_met: <XCircle size={15} className="mt-0.5 shrink-0 text-rose-600" />,
  unclear: <CircleHelp size={15} className="mt-0.5 shrink-0 text-amber-500" />
}

function Bar({ label, value, weight }: { label: string; value: number; weight: number }): ReactNode {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-stone-600">
          {label} <span className="text-stone-400">× {weight}</span>
        </span>
        <span className="font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-stone-100">
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

export default function CandidateDetail({
  c,
  label,
  job,
  onClose,
  onOpenCv,
  onDismissFlags,
  onDelete
}: {
  c: RankedCandidate
  label: string
  job: JobFilter
  onClose: () => void
  onOpenCv: () => void
  onDismissFlags: () => void
  onDelete: () => void
}): ReactNode {
  const a = c.analysis!
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-stone-900/20" onClick={onClose}>
      <div
        className="h-full w-[520px] overflow-y-auto border-l border-stone-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold" dir="auto">
              {displayName(c, label)}
            </div>
            <div className="text-sm text-stone-500">
              {a.yearsExperience != null ? `${a.yearsExperience} years of experience · ` : ''}
              {c.fileName}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={`text-3xl font-semibold tabular-nums ${scoreColor(c.score, job.threshold)}`}>{c.score}</div>
            <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close">
              <X size={16} />
            </Button>
          </div>
        </div>

        {c.rejected && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {c.reason}
          </div>
        )}
        <SecurityFlags item={c} onDismiss={onDismissFlags} />
        <div className="mb-1 rounded-lg bg-stone-50 px-3 py-2.5 text-sm text-stone-700" dir="auto">
          {a.verdict}
        </div>
        <div className="mb-5 px-1 text-xs text-stone-400">Based on what the CV claims. Check key claims in the interview.</div>

        <div className="mb-6 grid grid-cols-2 gap-x-5 gap-y-3">
          <Bar label="Skills" value={a.subScores.skills} weight={job.weights.skills} />
          <Bar label="Experience" value={a.subScores.experience} weight={job.weights.experience} />
          <Bar label="Education" value={a.subScores.education} weight={job.weights.education} />
          <Bar label="Languages" value={a.subScores.languages} weight={job.weights.languages} />
        </div>

        <div className="mb-2 text-sm font-semibold">Requirements</div>
        <div className="mb-6 space-y-2.5">
          {job.requirements.map((q) => {
            const r = a.requirements.find((x) => x.requirementId === q.id)
            return (
              <div key={q.id} className="flex gap-2 text-sm">
                {statusIcon[r?.status ?? 'unclear']}
                <div className="min-w-0">
                  <div dir="auto">
                    {q.text} {q.mustHave && <Chip>Must-have</Chip>}
                  </div>
                  {r?.evidence && (
                    <div className="mt-0.5 text-xs text-stone-500 italic" dir="auto">
                      “{r.evidence}”
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {a.redFlags.length > 0 && (
          <>
            <div className="mb-2 text-sm font-semibold">Points to check</div>
            <div className="mb-6 space-y-1.5">
              {a.redFlags.map((f) => (
                <div key={f} className="flex gap-2 text-sm text-amber-800" dir="auto">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {f}
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mb-6 grid grid-cols-2 gap-4">
          <div>
            <div className="mb-1.5 text-sm font-semibold">Matched skills</div>
            <div className="flex flex-wrap gap-1">
              {a.matchedSkills.map((s) => (
                <Chip key={s} tone="success">
                  {s}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-sm font-semibold">Missing skills</div>
            <div className="flex flex-wrap gap-1">
              {a.missingSkills.map((s) => (
                <Chip key={s} tone="danger">
                  {s}
                </Chip>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={onOpenCv}>
            <ExternalLink size={14} /> Open original CV
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm('Delete this candidate, its CV copy and its AI results from this computer?')) onDelete()
            }}
          >
            <Trash2 size={14} /> Delete
          </Button>
        </div>
        {c.scan === 'clean' && (
          <div className="mt-3 text-xs text-emerald-700">Scanned by Microsoft Defender: no threat found.</div>
        )}
        <div className="mt-6 text-xs text-stone-400">
          The assistant was told to ignore name, gender, age, photo, nationality and address when scoring. Contact details,
          birth date, nationality, address and bank details were removed before the CV was sent.
        </div>
      </div>
    </div>
  )
}
