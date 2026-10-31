import { useEffect, useState, type ReactNode } from 'react'
import { FileUp, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react'
import { PRESETS } from '@shared/presets'
import type { JobFilter, PresetId, Requirement } from '@shared/types'
import { api, errorMessage } from '../api'
import type { Route } from '../App'
import { Button, Card, Input, Label, PageHeader, Textarea, Toggle } from '../components/ui'

const blank = (): JobFilter => ({
  id: '',
  title: '',
  description: '',
  preset: 'generic',
  requirements: [],
  weights: { skills: 4, experience: 3, education: 2, languages: 1 },
  threshold: 60,
  autoRejectMissingMustHave: true,
  autoRejectBelowThreshold: true,
  createdAt: ''
})

const newId = (): string => Math.random().toString(36).slice(2, 10)

export default function JobEditor({ jobId, go }: { jobId?: string; go: (r: Route) => void }): ReactNode {
  const [job, setJob] = useState<JobFilter>(blank)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (jobId) api.jobs.get(jobId).then((j) => j && setJob(j))
  }, [jobId])

  const set = (patch: Partial<JobFilter>): void => setJob((j) => ({ ...j, ...patch }))
  const setReq = (id: string, patch: Partial<Requirement>): void =>
    set({ requirements: job.requirements.map((r) => (r.id === id ? { ...r, ...patch } : r)) })

  const extract = async (): Promise<void> => {
    if (job.description.trim().length < 40) {
      setError('Paste the full job description first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await api.jobs.extractRequirements(job.description, job.preset)
      set({ requirements: r.requirements, title: job.title || r.title })
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const save = async (): Promise<void> => {
    if (!job.title.trim()) return setError('Give this job filter a title.')
    if (!job.description.trim()) return setError('Add the job description.')
    if (job.requirements.filter((r) => r.text.trim()).length === 0)
      return setError('Add at least one requirement, or let the assistant extract them.')
    const saved = await api.jobs.save({ ...job, requirements: job.requirements.filter((r) => r.text.trim()) })
    go({ page: 'job', jobId: saved.id })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={jobId ? 'Edit job filter' : 'New job filter'}
        subtitle="The assistant screens every CV against this description and these requirements."
        actions={
          <>
            <Button onClick={() => go(jobId ? { page: 'job', jobId } : { page: 'jobs' })}>Cancel</Button>
            <Button variant="primary" onClick={save}>
              {jobId ? 'Save changes' : 'Create job filter'}
            </Button>
          </>
        }
      />
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>
      )}
      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <div className="grid grid-cols-[1fr_220px] gap-4">
            <div>
              <Label>Job title</Label>
              <Input
                dir="auto"
                placeholder="Credit analyst"
                value={job.title}
                onChange={(e) => set({ title: e.target.value })}
              />
            </div>
            <div>
              <Label>Industry</Label>
              <select
                className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                value={job.preset}
                onChange={(e) => set({ preset: e.target.value as PresetId })}
              >
                {Object.entries(PRESETS).map(([id, p]) => (
                  <option key={id} value={id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-end justify-between">
              <Label hint="Paste it, or load a .txt, .docx or .pdf file.">Job description</Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={async () => {
                  const t = await api.jobs.loadDescriptionFile()
                  if (t) set({ description: t })
                }}
              >
                <FileUp size={14} /> Load file
              </Button>
            </div>
            <Textarea
              rows={10}
              placeholder="Paste the job description here"
              value={job.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">Requirements</div>
              <div className="text-xs text-stone-500">
                Must-haves can reject a candidate automatically. You can switch that off on the filter page.
              </div>
            </div>
            <Button onClick={extract} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-accent" />}
              {job.requirements.length ? 'Extract again' : 'Extract from description'}
            </Button>
          </div>
          <div className="space-y-2">
            {job.requirements.map((r) => (
              <div key={r.id} className="flex items-center gap-3">
                <Input dir="auto" value={r.text} onChange={(e) => setReq(r.id, { text: e.target.value })} />
                <div className="w-32 shrink-0">
                  <Toggle checked={r.mustHave} onChange={(v) => setReq(r.id, { mustHave: v })} label="Must-have" />
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Remove requirement"
                  onClick={() => set({ requirements: job.requirements.filter((x) => x.id !== r.id) })}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
            {job.requirements.length === 0 && !busy && (
              <div className="rounded-lg border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
                Let the assistant read the description and suggest requirements, or add them yourself.
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="mt-3"
            onClick={() => set({ requirements: [...job.requirements, { id: newId(), text: '', mustHave: false }] })}
          >
            <Plus size={14} /> Add requirement
          </Button>
        </Card>
      </div>
    </div>
  )
}
