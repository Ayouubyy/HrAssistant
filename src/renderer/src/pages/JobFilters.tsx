import { useEffect, useState, type ReactNode } from 'react'
import { ArrowRight, Plus } from 'lucide-react'
import { PRESETS } from '@shared/presets'
import type { JobFilter } from '@shared/types'
import { api } from '../api'
import type { Route } from '../App'
import { Helper } from '../components/Helper'
import { Button, PageHeader } from '../components/ui'

const COLS = 'grid grid-cols-[minmax(0,1fr)_120px_64px_96px_104px_72px]'

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
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Job filters"
        subtitle="One filter per open position. Add the job description, drop in CVs, and I pre-screen them. You make the final call on every candidate."
        actions={
          <Button variant="primary" onClick={() => go({ page: 'newJob' })}>
            <Plus size={15} /> New job filter
          </Button>
        }
      />
      {jobs.length === 0 ? (
        <div className="flex items-center gap-5 py-10">
          <Helper size={56} mood="happy" />
          <div className="flex-1">
            <div className="text-base font-semibold text-stone-900">Create your first job filter</div>
            <div className="mt-1 max-w-md text-sm text-stone-600">
              Paste a job description, mark the must-haves, then drop in as many CVs as you have.
            </div>
          </div>
          <Button variant="primary" onClick={() => go({ page: 'newJob' })}>
            <Plus size={15} /> New job filter
          </Button>
        </div>
      ) : (
        <div role="table" aria-label="Job filters">
          <div role="row" className={`${COLS} border-b border-stone-300 pb-2 text-[11px] font-semibold tracking-wide text-stone-500 uppercase`}>
            <span role="columnheader">Role</span>
            <span role="columnheader">Industry</span>
            <span role="columnheader" className="text-right">
              CVs
            </span>
            <span role="columnheader" className="text-right">
              Must-haves
            </span>
            <span role="columnheader" className="text-right">
              Created
            </span>
            <span role="columnheader" />
          </div>
          {jobs.map((j) => (
            <button
              role="row"
              key={j.id}
              onClick={() => go({ page: 'job', jobId: j.id })}
              className={`${COLS} tabular w-full cursor-pointer items-baseline border-b border-stone-200 py-3 text-left text-sm hover:bg-white/70`}
            >
              <span role="cell" className="truncate pr-4 text-[15px] font-semibold text-stone-900" dir="auto">
                {j.title}
                {j.closedAt && <span className="ml-2 text-xs font-normal text-stone-500">closed</span>}
              </span>
              <span role="cell" className="text-stone-600">
                {PRESETS[j.preset].label}
              </span>
              <span role="cell" className="text-right text-stone-800">
                {counts[j.id] ?? 0}
              </span>
              <span role="cell" className="text-right text-stone-800">
                {j.requirements.filter((r) => r.mustHave).length}
              </span>
              <span role="cell" className="text-right text-stone-600">
                {new Date(j.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
              </span>
              <span role="cell" className="flex justify-end text-accent">
                <ArrowRight size={15} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
