import type { ReactNode } from 'react'
import { Sparkles } from 'lucide-react'
import type { Candidate, EmailItem, JobFilter } from '@shared/types'
import type { AssistantFilter } from '../App'

export type AssistantContext =
  | { kind: 'job'; job: JobFilter; candidates: Candidate[] }
  | { kind: 'email'; email: EmailItem }
  | { kind: 'none' }

export default function AssistantPanel({
  ctx
}: {
  ctx: AssistantContext
  onFilter: (f: AssistantFilter | null) => void
}): ReactNode {
  void ctx
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-stone-200 bg-white">
      <div className="flex items-center gap-2 border-b border-stone-100 px-4 py-3 font-medium">
        <Sparkles size={16} className="text-accent" /> Assistant
      </div>
      <div className="flex-1" />
    </aside>
  )
}
