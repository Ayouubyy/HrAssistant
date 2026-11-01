import type { ReactNode } from 'react'
import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { needsReview } from '@shared/flags'
import type { ReviewFlag } from '@shared/types'
import { Button, Chip } from './ui'

const tone = { high: 'text-rose-800 bg-rose-50 border-rose-200', warn: 'text-amber-900 bg-amber-50 border-amber-200', info: 'text-stone-700 bg-stone-50 border-stone-200' }

export function NeedsReviewChip({ item }: { item: { flags?: ReviewFlag[]; flagsDismissed?: boolean } }): ReactNode {
  if (!needsReview(item)) return null
  return (
    <Chip tone="danger">
      <ShieldAlert size={11} /> Needs review
    </Chip>
  )
}

// Security findings with their evidence. Flags never change a score; HR decides whether they matter.
export function SecurityFlags({
  item,
  onDismiss
}: {
  item: { flags?: ReviewFlag[]; flagsDismissed?: boolean }
  onDismiss: () => void
}): ReactNode {
  const flags = item.flags ?? []
  if (!flags.length) return null
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          {item.flagsDismissed ? <ShieldCheck size={15} className="text-stone-400" /> : <ShieldAlert size={15} className="text-rose-600" />}
          Security
        </div>
        {item.flagsDismissed ? (
          <span className="text-xs text-stone-500">Reviewed by HR</span>
        ) : (
          flags.some((f) => f.severity === 'high') && (
            <Button size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )
        )}
      </div>
      <div className="space-y-1.5">
        {flags.map((f, i) => (
          <div key={i} className={`rounded-lg border px-3 py-2 text-sm ${item.flagsDismissed ? tone.info : tone[f.severity]}`}>
            <div>{f.detail}</div>
            {f.evidence && (
              <div className="mt-1 font-mono text-xs break-words opacity-80" dir="auto">
                {f.evidence}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
