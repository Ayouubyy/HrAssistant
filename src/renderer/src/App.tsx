import { useState, type ReactNode } from 'react'
import { Briefcase, Inbox, Lock, Plug, Plus, Settings as SettingsIcon, Sparkles } from 'lucide-react'
import Settings from './pages/Settings'

export type Route =
  | { page: 'jobs' }
  | { page: 'newJob' }
  | { page: 'job'; jobId: string }
  | { page: 'inbox' }
  | { page: 'accounts' }
  | { page: 'settings' }

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

  const page = (): ReactNode => {
    switch (route.page) {
      case 'settings':
        return <Settings />
      default:
        return <div className="text-stone-500">Coming next.</div>
    }
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-stone-200 bg-[#efede8] p-3">
        <div className="mb-5 flex items-center gap-2 px-2 pt-1">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
            <Briefcase size={15} />
          </div>
          <div className="font-semibold text-stone-900">HR Assistant</div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          <NavItem
            icon={<Briefcase size={16} />}
            label="Job filters"
            active={route.page === 'jobs' || route.page === 'job'}
            onClick={() => setRoute({ page: 'jobs' })}
          />
          <button
            onClick={() => setRoute({ page: 'newJob' })}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md py-1 pr-2 pl-8 text-left text-sm text-accent hover:bg-stone-200/60"
          >
            <Plus size={14} /> New job filter
          </button>
          <div className="h-3" />
          <NavItem
            icon={<Inbox size={16} />}
            label="Inbox"
            active={route.page === 'inbox'}
            onClick={() => setRoute({ page: 'inbox' })}
          />
          <NavItem
            icon={<Plug size={16} />}
            label="Connected accounts"
            active={route.page === 'accounts'}
            onClick={() => setRoute({ page: 'accounts' })}
          />
          <NavItem
            icon={<SettingsIcon size={16} />}
            label="Settings"
            active={route.page === 'settings'}
            onClick={() => setRoute({ page: 'settings' })}
          />
        </nav>
        <div className="flex items-center gap-1.5 px-2 pt-3 text-xs text-stone-500">
          <Lock size={12} /> All data stored on this computer
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-8 py-7">{page()}</main>

      <aside className="flex w-80 shrink-0 flex-col border-l border-stone-200 bg-white">
        <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 font-medium">
          <Sparkles size={16} className="text-accent" /> Assistant
        </div>
        <div className="flex-1" />
      </aside>
    </div>
  )
}
