import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Helper } from '../components/Helper'
import { soonFeature, type SoonId } from '../roadmap'

export function SoonTag(): ReactNode {
  return (
    <span className="inline-flex items-center rounded-[3px] border border-stone-300 px-1.5 py-px text-[11px] font-medium tracking-wide text-stone-600 uppercase">
      Coming soon
    </span>
  )
}

export default function ComingSoon({ id, onBack, backLabel }: { id: SoonId; onBack?: () => void; backLabel?: string }): ReactNode {
  const f = soonFeature(id)
  return (
    <div className="mx-auto max-w-3xl">
      {onBack && (
        <button onClick={onBack} className="mb-5 inline-flex cursor-pointer items-center gap-1.5 text-sm text-accent hover:underline">
          <ArrowLeft size={14} /> {backLabel ?? 'Back'}
        </button>
      )}
      <div className="mb-8 border-b border-stone-900 pb-5">
        <SoonTag />
        <h1 className="mt-3 text-[34px] leading-tight font-semibold tracking-[-0.025em] text-balance text-stone-900">{f.title}</h1>
        <p className="mt-2 max-w-[60ch] text-[15px] text-stone-600">{f.summary}</p>
      </div>
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">What it will do</h2>
      <ol className="border-t border-stone-300">
        {f.will.map((w) => (
          <li key={w} className="flex gap-3 border-b border-stone-200 py-3 text-[15px] text-stone-800">
            <span aria-hidden="true" className="mt-[7px] h-2 w-2 shrink-0 border border-stone-500" />
            {w}
          </li>
        ))}
      </ol>
      {f.terms && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-semibold tracking-wide text-stone-500 uppercase">Statuses</span>
          {f.terms.map((t) => (
            <span key={t} className="rounded-[3px] border border-stone-300 bg-white px-2 py-0.5 text-xs text-stone-700">
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="mt-8 flex items-start gap-3 bg-accent-soft px-4 py-3.5">
        <Helper size={36} />
        <div>
          <div className="text-sm font-semibold text-accent">You stay in charge</div>
          <p className="mt-0.5 text-sm text-stone-700">{f.hrDecides}</p>
        </div>
      </div>
      <p className="mt-6 text-sm text-stone-500">This feature isn’t available yet. Screening and the inbox work today.</p>
    </div>
  )
}
