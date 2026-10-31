import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Briefcase, Inbox as InboxIcon, Lock, Plug, Plus, Settings as SettingsIcon } from 'lucide-react'
import type { Candidate, EmailItem, JobFilter } from '@shared/types'
import { api } from './api'
import AssistantPanel, { type AssistantContext } from './components/AssistantPanel'
import JobEditor from './pages/JobEditor'
import JobFilterPage from './pages/JobFilterPage'
import JobFilters from './pages/JobFilters'
import Settings from './pages/Settings'
import Inbox from './pages/Inbox'
import Accounts from './pages/Accounts'

export type Route =
  | { page: 'jobs' }
  | { page: 'newJob' }
  | { page: 'editJob'; jobId: string }
  | { page: 'job'; jobId: string }
  | { page: 'inbox' }
  | { page: 'accounts' }
  | { page: 'settings' }

export interface AssistantFilter {
  label: string
  minYears?: number
  skills?: string[]
  ids?: string[]
}

function NavItem({
  icon,
  label,
  active,
  onClick,
  badge
}: {
  icon: ReactNode
  label: string
  active: boolean
  onClick: () => void
  badge?: ReactNode
}): ReactNode {
  return (
    <button
      onClick={onClick}
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition ${
        active ? 'bg-white font-medium text-stone-900 shadow-sm' : 'text-stone-600 hover:bg-stone-200/60'
      }`}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </button>
  )
}

export default function App(): ReactNode {
  const [route, setRoute] = useState<Route>({ page: 'jobs' })
  const [jobs, setJobs] = useState<JobFilter[]>([])
  const [ctx, setCtx] = useState<AssistantContext>({ kind: 'none' })
  const [filter, setFilter] = useState<AssistantFilter | null>(null)

  useEffect(() => {
    const load = (): void => void api.jobs.list().then(setJobs)
    load()
    return api.on('jobs:changed', load)
  }, [])

  const go = useCallback((r: Route) => {
    setFilter(null)
    setRoute(r)
  }, [])

  const onJobContext = useCallback((job: JobFilter | null, candidates: Candidate[]) => {
    setCtx(job ? { kind: 'job', job, candidates } : { kind: 'none' })
  }, [])
  const onEmailContext = useCallback((email: EmailItem | null) => {
    setCtx(email ? { kind: 'email', email } : { kind: 'none' })
  }, [])

  const page = (): ReactNode => {
    switch (route.page) {
      case 'jobs':
        return <JobFilters go={go} />
      case 'newJob':
        return <JobEditor key="new" go={go} />
      case 'editJob':
        return <JobEditor key={route.jobId} jobId={route.jobId} go={go} />
      case 'job':
        return (
          <JobFilterPage
            key={route.jobId}
            jobId={route.jobId}
            go={go}
            onContext={onJobContext}
            assistantFilter={filter}
            clearAssistantFilter={() => setFilter(null)}
          />
        )
      case 'inbox':
        return <Inbox go={go} onContext={onEmailContext} />
      case 'accounts':
        return <Accounts />
      case 'settings':
        return <Settings />
    }
  }

  const activeJob = route.page === 'job' || route.page === 'editJob' ? route.jobId : null

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-[#efede8] p-3">
        <div className="mb-5 flex items-center gap-2 px-2 pt-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
            <Briefcase size={15} />
          </div>
          <div className="font-semibold text-stone-900">HR Assistant</div>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5">
          <NavItem
            icon={<Briefcase size={16} />}
            label="Job filters"
            active={route.page === 'jobs'}
            onClick={() => go({ page: 'jobs' })}
          />
          <button
            onClick={() => go({ page: 'newJob' })}
            className={`flex w-full cursor-pointer items-center gap-2 rounded-md py-1 pr-2 pl-8 text-left text-sm hover:bg-stone-200/60 ${
              route.page === 'newJob' ? 'font-medium text-accent' : 'text-accent'
            }`}
          >
            <Plus size={14} /> New job filter
          </button>
          <div className="max-h-[40vh] overflow-y-auto">
            {jobs.map((j) => (
              <button
                key={j.id}
                onClick={() => go({ page: 'job', jobId: j.id })}
                dir="auto"
                className={`block w-full cursor-pointer truncate rounded-md py-1 pr-2 pl-8 text-left text-sm transition ${
                  activeJob === j.id ? 'bg-white font-medium text-stone-900 shadow-sm' : 'text-stone-600 hover:bg-stone-200/60'
                }`}
              >
                {j.title}
              </button>
            ))}
          </div>
          <div className="h-3" />
          <NavItem
            icon={<InboxIcon size={16} />}
            label="Inbox"
            active={route.page === 'inbox'}
            onClick={() => go({ page: 'inbox' })}
          />
          <NavItem
            icon={<Plug size={16} />}
            label="Connected accounts"
            active={route.page === 'accounts'}
            onClick={() => go({ page: 'accounts' })}
          />
          <NavItem
            icon={<SettingsIcon size={16} />}
            label="Settings"
            active={route.page === 'settings'}
            onClick={() => go({ page: 'settings' })}
          />
        </nav>
        <div className="flex items-center gap-1.5 px-2 pt-3 text-xs text-stone-500">
          <Lock size={12} /> All data stored on this computer
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-8 py-7">{page()}</main>

      <AssistantPanel ctx={ctx} onFilter={setFilter} />
    </div>
  )
}
