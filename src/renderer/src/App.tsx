import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  Briefcase,
  CalendarClock,
  Home as HomeIcon,
  Inbox as InboxIcon,
  Lock,
  MessagesSquare,
  Network,
  Plug,
  Plus,
  Settings as SettingsIcon,
  Sprout
} from 'lucide-react'
import type { Candidate, EmailItem, JobFilter } from '@shared/types'
import { api } from './api'
import AssistantPanel, { type AssistantContext } from './components/AssistantPanel'
import { Helper } from './components/Helper'
import JobEditor from './pages/JobEditor'
import JobFilterPage, { type Tab } from './pages/JobFilterPage'
import JobFilters from './pages/JobFilters'
import Settings from './pages/Settings'
import Inbox from './pages/Inbox'
import Accounts from './pages/Accounts'
import Home from './pages/Home'
import ComingSoon from './pages/ComingSoon'
import type { SoonId } from './roadmap'

export type Route =
  | { page: 'home' }
  | { page: 'jobs' }
  | { page: 'newJob' }
  | { page: 'editJob'; jobId: string }
  | { page: 'job'; jobId: string; candidateId?: string; tab?: Tab }
  | { page: 'inbox'; emailId?: string }
  | { page: 'accounts' }
  | { page: 'settings' }
  | { page: 'soon'; id: SoonId; back?: Route }

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
  icon?: ReactNode
  label: string
  active: boolean
  onClick: () => void
  badge?: ReactNode
}): ReactNode {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-[7px] text-left text-sm transition-colors ${
        active ? 'bg-white text-stone-900' : 'text-rail-ink hover:bg-rail-line'
      } ${icon ? '' : 'pl-[38px]'}`}
    >
      {icon && <span className={active ? 'text-accent' : 'text-rail-muted'}>{icon}</span>}
      <span className="flex-1 truncate" dir="auto">
        {label}
      </span>
      {badge}
    </button>
  )
}

function RailHeading({ children }: { children: ReactNode }): ReactNode {
  return <div className="px-3 pt-5 pb-1.5 text-[11px] font-semibold tracking-wide text-rail-muted uppercase">{children}</div>
}

export default function App({ onLock }: { onLock: () => void }): ReactNode {
  const [route, setRoute] = useState<Route>({ page: 'home' })
  const [jobs, setJobs] = useState<JobFilter[]>([])
  const [ctx, setCtx] = useState<AssistantContext>({ kind: 'none' })
  const [filter, setFilter] = useState<AssistantFilter | null>(null)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    const load = (): void => void api.jobs.list().then(setJobs)
    load()
    return api.on('jobs:changed', load)
  }, [])

  useEffect(() => {
    const load = (): void =>
      void api.inbox.list().then((es) => setUnread(es.filter((e) => e.triage?.urgent && e.auth?.verdict !== 'spoofed').length))
    load()
    const a = api.on('emails:changed', load)
    const b = api.on('emails:updated', load)
    return () => {
      a()
      b()
    }
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
      case 'home':
        return <Home go={go} />
      case 'jobs':
        return <JobFilters go={go} />
      case 'newJob':
        return <JobEditor key="new" go={go} />
      case 'editJob':
        return <JobEditor key={route.jobId} jobId={route.jobId} go={go} />
      case 'job':
        return (
          <JobFilterPage
            key={`${route.jobId}-${route.candidateId ?? ''}-${route.tab ?? ''}`}
            jobId={route.jobId}
            initialOpenId={route.candidateId}
            initialTab={route.tab}
            go={go}
            onContext={onJobContext}
            assistantFilter={filter}
            clearAssistantFilter={() => setFilter(null)}
          />
        )
      case 'inbox':
        return <Inbox key={route.emailId ?? 'inbox'} go={go} onContext={onEmailContext} initialSelected={route.emailId} />
      case 'accounts':
        return <Accounts />
      case 'settings':
        return <Settings />
      case 'soon':
        return (
          <ComingSoon
            key={route.id}
            id={route.id}
            onBack={route.back ? () => go(route.back!) : undefined}
            backLabel={route.back?.page === 'job' ? 'Back to the candidates' : undefined}
          />
        )
    }
  }

  const activeJob = route.page === 'job' || route.page === 'editJob' ? route.jobId : null
  const soonActive = (id: SoonId): boolean => route.page === 'soon' && route.id === id && !route.back

  return (
    <div className="flex h-full">
      <aside className="flex w-[232px] shrink-0 flex-col bg-rail text-rail-ink">
        <div className="flex items-center gap-2.5 px-3 pt-4 pb-5">
          <div className="rounded-full bg-white p-0.5">
            <Helper size={30} />
          </div>
          <div className="leading-tight">
            <div className="font-semibold tracking-[-0.01em] text-white">HR Assistant</div>
            <div className="text-[11px] text-rail-muted">Atlas Bank · demo</div>
          </div>
        </div>
        <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <NavItem icon={<HomeIcon size={16} />} label="Home" active={route.page === 'home'} onClick={() => go({ page: 'home' })} />
          <NavItem
            icon={<InboxIcon size={16} />}
            label="Inbox"
            active={route.page === 'inbox'}
            onClick={() => go({ page: 'inbox' })}
            badge={
              unread > 0 ? (
                <span className="tabular rounded-[3px] bg-needs px-1.5 text-[11px] font-semibold text-white">{unread}</span>
              ) : undefined
            }
          />
          <NavItem icon={<Briefcase size={16} />} label="Job filters" active={route.page === 'jobs'} onClick={() => go({ page: 'jobs' })} />
          {jobs.map((j) => (
            <NavItem key={j.id} label={j.title} active={activeJob === j.id} onClick={() => go({ page: 'job', jobId: j.id })} />
          ))}
          <button
            onClick={() => go({ page: 'newJob' })}
            className={`flex w-full cursor-pointer items-center gap-2 py-[7px] pr-3 pl-[38px] text-left text-sm hover:bg-rail-line ${
              route.page === 'newJob' ? 'text-white' : 'text-rail-muted'
            }`}
          >
            <Plus size={14} /> New job filter
          </button>

          {/* These open a page explaining the feature; they aren't built yet (see roadmap.ts). */}
          <NavItem icon={<CalendarClock size={16} />} label="Interviews" active={soonActive('interviews')} onClick={() => go({ page: 'soon', id: 'interviews' })} />

          <RailHeading>People</RailHeading>
          <NavItem icon={<MessagesSquare size={16} />} label="Employee Q&A" active={soonActive('employeeQa')} onClick={() => go({ page: 'soon', id: 'employeeQa' })} />
          <NavItem icon={<Sprout size={16} />} label="People growth" active={soonActive('people')} onClick={() => go({ page: 'soon', id: 'people' })} />
          <NavItem icon={<Network size={16} />} label="Workforce planning" active={soonActive('workforce')} onClick={() => go({ page: 'soon', id: 'workforce' })} />

          <div className="mt-auto pt-6">
            <NavItem icon={<Plug size={16} />} label="Connected accounts" active={route.page === 'accounts'} onClick={() => go({ page: 'accounts' })} />
            <NavItem icon={<SettingsIcon size={16} />} label="Settings" active={route.page === 'settings'} onClick={() => go({ page: 'settings' })} />
          </div>
        </nav>
        <div className="mt-2 flex items-center justify-between border-t border-rail-line px-3 py-3 text-xs text-rail-muted">
          <span>Stored on this computer</span>
          <button
            onClick={async () => {
              await api.lock.lock()
              onLock()
            }}
            className="flex cursor-pointer items-center gap-1 rounded-[3px] px-1.5 py-0.5 text-rail-ink hover:bg-rail-line"
          >
            <Lock size={12} /> Lock
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-10 py-8">{page()}</main>

      <AssistantPanel ctx={ctx} onFilter={setFilter} />
    </div>
  )
}
