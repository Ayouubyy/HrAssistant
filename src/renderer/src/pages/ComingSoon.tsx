import type { ReactNode } from 'react'
import { Helper } from '../components/Helper'
import { ROADMAP, SOON, type SoonId } from '../roadmap'

function SoonTag(): ReactNode {
  return (
    <span className="inline-flex items-center rounded-[3px] border border-stone-300 px-1.5 py-px text-[11px] font-medium tracking-wide text-stone-600 uppercase">
      Coming soon
    </span>
  )
}

function Roadmap(): ReactNode {
  const groups = [...new Set(ROADMAP.map((r) => r.group))]
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-end justify-between gap-6 border-b border-stone-900 pb-4">
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] text-stone-900">Roadmap</h1>
          <p className="mt-1 text-sm text-stone-600">What comes after the screening and inbox you can use today.</p>
        </div>
        <Helper size={44} mood="happy" />
      </div>
      <div className="grid gap-8">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-stone-500 uppercase">{g}</h2>
            <div className="border-t border-stone-300">
              {ROADMAP.filter((r) => r.group === g).map((r) => (
                <div key={r.name} className="grid grid-cols-[200px_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-stone-200 py-2.5">
                  <span className="font-medium text-stone-900">{r.name}</span>
                  <span className="text-sm text-stone-600">{r.line}</span>
                  <SoonTag />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

export default function ComingSoon({ id }: { id: SoonId }): ReactNode {
  if (id === 'roadmap') return <Roadmap />
  const f = SOON.find((x) => x.id === id)!
  return (
    <div className="mx-auto max-w-3xl">
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
      <div className="mt-8 flex items-start gap-3 bg-accent-soft px-4 py-3.5">
        <Helper size={36} />
        <div>
          <div className="text-sm font-semibold text-accent">You stay in charge</div>
          <p className="mt-0.5 text-sm text-stone-700">{f.hrDecides}</p>
        </div>
      </div>
      <p className="mt-6 text-sm text-stone-500">Not available yet. Screening and the inbox work today.</p>
    </div>
  )
}
