import { useEffect, useState, type ReactNode } from 'react'
import { Briefcase, FileText, Plus } from 'lucide-react'
import { PRESETS } from '@shared/presets'
import type { JobFilter } from '@shared/types'
import { api } from '../api'
import type { Route } from '../App'
import { Button, Card, Chip, PageHeader } from '../components/ui'

export default function JobFilters({ go }: { go: (r: Route) => void }): ReactNode {
  const [jobs, setJobs] = useState<JobFilter[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    const load = (): void => {
      api.jobs.list().then(setJobs)
      api.candidates.counts().then(setCounts)
    }
    load()
    return api.on('jobs:changed', load)
  }, [])

  if (!jobs) return null

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Job filters"
        subtitle="One filter per open position. Add the job description, drop in CVs, and let the assistant pre-screen them."
        actions={
          <Button variant="primary" onClick={() => go({ page: 'newJob' })}>
            <Plus size={15} /> New job filter
          </Button>
        }
      />
      {jobs.length === 0 ? (
        <Card className="flex flex-col items-center px-8 py-14 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Briefcase size={20} />
          </div>
          <div className="text-base font-semibold">Create your first job filter</div>
          <div className="mt-1 max-w-sm text-sm text-stone-500">
            Paste a job description, mark the must-haves, then drop in as many CVs as you have. You make the final call on
            every candidate.
          </div>
          <Button variant="primary" className="mt-5" onClick={() => go({ page: 'newJob' })}>
            <Plus size={15} /> New job filter
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {jobs.map((j) => (
            <button
              key={j.id}
              onClick={() => go({ page: 'job', jobId: j.id })}
              className="cursor-pointer rounded-xl border border-stone-200 bg-white p-4 text-left transition hover:border-stone-300 hover:shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold text-stone-900" dir="auto">
                  {j.title}
                </div>
                <Chip>{PRESETS[j.preset].label}</Chip>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-stone-500">
                <span className="flex items-center gap-1">
                  <FileText size={13} /> {counts[j.id] ?? 0} CVs
                </span>
                <span>{j.requirements.filter((r) => r.mustHave).length} must-haves</span>
                <span>Created {new Date(j.createdAt).toLocaleDateString()}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
