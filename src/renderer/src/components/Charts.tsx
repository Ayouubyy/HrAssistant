import { useState, type ReactNode } from 'react'
import type { RankedCandidate } from '@shared/scoring'
import { cvRef } from '../refs'
import { DOT_LABEL, dotState, type DotState } from '../charts'

// Charts for the home dashboard, drawn with plain elements on the Annual Report Grid tokens:
// one petrol hue for quantities, red only for what waits on HR, ochre only for work in progress.
// Every state also has its own shape or a printed value, so nothing is read from colour alone.

export function Dot({ state }: { state: DotState }): ReactNode {
  if (state === 'review') return <span className="block h-[11px] w-[11px] bg-needs" />
  if (state === 'short') return <span className="block h-3 w-3 rounded-full bg-accent" />
  if (state === 'out') return <span className="block h-2 w-2 rounded-full bg-stone-400" />
  return <span className="block h-3 w-3 rounded-full border-2 border-accent bg-white" />
}

const LANE = 15

// Spreads candidates with close scores over a few lanes so every dot stays visible and clickable.
function lanes(points: { id: string; score: number }[]): Map<string, number> {
  const last: number[] = []
  const out = new Map<string, number>()
  for (const p of [...points].sort((a, b) => a.score - b.score)) {
    let lane = last.findIndex((x) => p.score - x >= 2.6)
    if (lane === -1) lane = last.length < 4 ? last.length : last.indexOf(Math.min(...last))
    last[lane] = p.score
    out.set(p.id, lane)
  }
  return out
}

export function ScoreStrip({
  candidates,
  numbers,
  threshold,
  onOpen
}: {
  candidates: RankedCandidate[]
  numbers: Map<string, number>
  threshold: number
  onOpen: (id: string) => void
}): ReactNode {
  const [hover, setHover] = useState<string | null>(null)
  const pos = lanes(candidates.map((c) => ({ id: c.id, score: c.score })))
  const height = 28 + Math.max(1, ...[...pos.values()].map((l) => l + 1)) * LANE
  const hovered = candidates.find((c) => c.id === hover)

  return (
    <div className="relative mx-1.5" style={{ height }}>
      {/* below the threshold */}
      <div className="absolute inset-y-0 left-0 bg-stone-100" style={{ width: `${threshold}%` }} />
      {[0, 25, 50, 75, 100].map((t) => (
        <div key={t} className="absolute inset-y-0 w-px bg-stone-200" style={{ left: `${t}%` }} />
      ))}
      <div className="absolute inset-y-0 w-px bg-stone-900" style={{ left: `${threshold}%` }} />
      <div className="tabular absolute top-0 -translate-x-1/2 bg-paper px-1 text-[10px] font-semibold text-stone-900" style={{ left: `${threshold}%` }}>
        {threshold}
      </div>
      {candidates.map((c) => {
        const state = dotState(c)
        const n = numbers.get(c.id) ?? 0
        return (
          <button
            key={c.id}
            onClick={() => onOpen(c.id)}
            onMouseEnter={() => setHover(c.id)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(c.id)}
            onBlur={() => setHover(null)}
            aria-label={`${cvRef(n)}, score ${c.score}, ${DOT_LABEL[state]}`}
            className="absolute flex h-4 w-4 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full transition-transform hover:scale-125"
            style={{ left: `${c.score}%`, bottom: 4 + (pos.get(c.id) ?? 0) * LANE }}
          >
            <Dot state={state} />
          </button>
        )
      })}
      {hovered && (
        <div
          role="tooltip"
          className="tabular pointer-events-none absolute z-10 -translate-x-1/2 rounded-[3px] bg-stone-900 px-2 py-1 text-[11px] font-medium whitespace-nowrap text-white"
          style={{ left: `${hovered.score}%`, bottom: 24 + (pos.get(hovered.id) ?? 0) * LANE }}
        >
          {cvRef(numbers.get(hovered.id) ?? 0)} · {hovered.score} · {DOT_LABEL[dotState(hovered)]}
        </div>
      )}
    </div>
  )
}

export function StripAxis(): ReactNode {
  return (
    <div className="relative mx-1.5 h-4">
      {[0, 25, 50, 75, 100].map((t) => (
        <span key={t} className="tabular absolute -translate-x-1/2 text-[10px] text-stone-500" style={{ left: `${t}%` }}>
          {t}
        </span>
      ))}
    </div>
  )
}

export interface BarRow {
  key: string
  label: string
  value: number
  detail?: string
  bar?: string
}

// Horizontal bars, one hue, values printed at the end.
export function BarList({ rows, max }: { rows: BarRow[]; max?: number }): ReactNode {
  const top = Math.max(1, max ?? Math.max(...rows.map((r) => r.value)))
  // Notes get their own column so every bar track has the same length.
  const cols = rows.some((r) => r.detail) ? 'grid-cols-[104px_minmax(0,1fr)_3ch_60px]' : 'grid-cols-[112px_minmax(0,1fr)_3ch]'
  return (
    <div className="grid gap-2">
      {rows.map((r) => (
        <div key={r.key} className={`grid ${cols} items-center gap-3 text-sm`} title={`${r.label}: ${r.value}`}>
          <span className="truncate text-stone-700">{r.label}</span>
          <span className="h-2.5 bg-stone-100">
            <span
              className={`block h-full rounded-r-[4px] ${r.bar ?? 'bg-accent'} transition-[width] duration-500 ease-out`}
              style={{ width: r.value ? `max(4px, ${(r.value / top) * 100}%)` : 0 }}
            />
          </span>
          <span className="tabular text-right font-semibold text-stone-900">{r.value}</span>
          {cols.includes('60px') && <span className="truncate text-xs text-stone-500">{r.detail}</span>}
        </div>
      ))}
    </div>
  )
}

export interface Segment {
  key: string
  label: string
  value: number
  fill: string
}

// One part-to-whole bar with a 2px gap between parts, and a legend that prints every value.
export function StackBar({ label, segments, empty }: { label: string; segments: Segment[]; empty: string }): ReactNode {
  const total = segments.reduce((n, s) => n + s.value, 0)
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-stone-900">{label}</span>
        <span className="tabular text-xs text-stone-500">{total}</span>
      </div>
      {total === 0 ? (
        <div className="h-3 bg-stone-100" title={empty} />
      ) : (
        <div className="flex h-3 gap-[2px]">
          {segments
            .filter((s) => s.value > 0)
            .map((s, i, all) => (
              <span
                key={s.key}
                title={`${s.label}: ${s.value}`}
                className={`${s.fill} ${i === all.length - 1 ? 'rounded-r-[4px]' : ''}`}
                style={{ flexGrow: s.value, flexBasis: 0, minWidth: 4 }}
              />
            ))}
        </div>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-600">
        {total === 0 ? (
          <span className="text-stone-500">{empty}</span>
        ) : (
          segments.map((s) => (
            <span key={s.key} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 ${s.fill}`} />
              <span className="tabular font-semibold text-stone-900">{s.value}</span> {s.label}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
