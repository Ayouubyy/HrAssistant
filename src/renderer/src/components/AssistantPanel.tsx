import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Briefcase, Filter, Mail } from 'lucide-react'
import type { Candidate, EmailItem, JobFilter } from '@shared/types'
import { api, errorMessage } from '../api'
import type { AssistantFilter } from '../App'
import { Helper, HelperPlate, ThinkingDots } from './Helper'

export type AssistantContext =
  | { kind: 'job'; job: JobFilter; candidates: Candidate[] }
  | { kind: 'email'; email: EmailItem }
  | { kind: 'none' }

interface Msg {
  role: 'user' | 'assistant'
  content: string
  filter?: AssistantFilter
  error?: boolean
}

const suggestions: Record<AssistantContext['kind'], string[]> = {
  job: [
    'Summarize the top 3 candidates',
    'Compare the top 2 candidates',
    'Who has more than 5 years of experience?',
    'Which rejected candidates are worth a second look?'
  ],
  email: ['Summarize this email', 'What does this person need from HR?', 'Draft a short, friendly reply'],
  none: ['How do I screen CVs for a new position?', 'What can you help me with?']
}

const keyOf = (c: AssistantContext): string =>
  c.kind === 'job' ? `job:${c.job.id}` : c.kind === 'email' ? `email:${c.email.id}` : 'none'

export default function AssistantPanel({
  ctx,
  onFilter
}: {
  ctx: AssistantContext
  onFilter: (f: AssistantFilter | null) => void
}): ReactNode {
  const [threads, setThreads] = useState<Record<string, Msg[]>>({})
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const key = keyOf(ctx)
  const msgs = threads[key] ?? []
  // A reply that arrives after HR moved to another page must not filter that other page.
  const currentKey = useRef(key)
  currentKey.current = key

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs.length, busy])

  const send = async (text: string): Promise<void> => {
    const q = text.trim()
    if (!q || busy) return
    const history: Msg[] = [...msgs, { role: 'user', content: q }]
    setThreads((t) => ({ ...t, [key]: history }))
    setInput('')
    setBusy(true)
    try {
      const ref =
        ctx.kind === 'job'
          ? { kind: 'job' as const, jobId: ctx.job.id }
          : ctx.kind === 'email'
            ? { kind: 'email' as const, emailId: ctx.email.id }
            : { kind: 'none' as const }
      const r = await api.assistant.ask(
        ref,
        history.filter((m) => !m.error).map(({ role, content }) => ({ role, content }))
      )
      const reply: Msg = { role: 'assistant', content: r.answer, filter: r.filter }
      setThreads((t) => ({ ...t, [key]: [...history, reply] }))
      if (r.filter && currentKey.current === key && (!r.jobId || keyOf(ctx) === `job:${r.jobId}`)) onFilter(r.filter)
    } catch (e) {
      setThreads((t) => ({ ...t, [key]: [...history, { role: 'assistant', content: errorMessage(e), error: true }] }))
    } finally {
      setBusy(false)
    }
  }

  const contextLabel =
    ctx.kind === 'job' ? (
      <>
        <Briefcase size={12} /> {ctx.job.title} · {ctx.candidates.length} candidates
      </>
    ) : ctx.kind === 'email' ? (
      <>
        <Mail size={12} /> {ctx.email.subject}
      </>
    ) : null

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-stone-300 bg-white">
      <div className="flex items-center gap-3 border-b border-stone-200 px-4 py-3">
        <Helper size={40} mood={busy ? 'thinking' : 'idle'} />
        <div className="min-w-0 flex-1">
          <HelperPlate line={busy ? 'Thinking…' : 'Ask me about this page'} />
          {contextLabel && (
            <div className="mt-1 flex items-center gap-1 truncate text-xs text-stone-500" dir="auto">
              {contextLabel}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {msgs.length === 0 && (
          <div>
            <div className="mb-3 text-sm text-stone-600">
              {ctx.kind === 'job'
                ? 'Ask about these candidates. Names stay hidden from me, and the decisions stay with you.'
                : ctx.kind === 'email'
                  ? 'Ask about this email. I draft, you send.'
                  : "Hi, I'm Nour. Open a job filter or an email and ask me about it."}
            </div>
            <div className="space-y-1.5">
              {suggestions[ctx.kind].map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="block w-full cursor-pointer rounded-lg border border-stone-200 px-3 py-2 text-left text-sm text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-8 rounded-lg rounded-br-md bg-stone-100 px-3 py-2 text-sm" dir="auto">
              {m.content}
            </div>
          ) : (
            <div key={i} className="text-sm leading-relaxed">
              <div className={`whitespace-pre-wrap ${m.error ? 'text-rose-700' : 'text-stone-800'}`} dir="auto">
                {m.content}
              </div>
              {m.filter && (
                <button
                  onClick={() => onFilter(m.filter!)}
                  className="mt-2 flex cursor-pointer items-center gap-1 rounded-md bg-accent-soft px-2 py-1 text-xs text-accent"
                >
                  <Filter size={12} /> Showing: {m.filter.label}
                </button>
              )}
            </div>
          )
        )}
        {busy && (
          <div className="py-1">
            <ThinkingDots />
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form
        className="border-t border-stone-100 p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void send(input)
        }}
      >
        <div className="flex items-end gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 focus-within:border-accent">
          <textarea
            rows={1}
            dir="auto"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send(input)
              }
            }}
            placeholder="Ask the assistant"
            className="max-h-32 flex-1 resize-none bg-transparent text-sm outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            aria-label="Send"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg bg-accent text-white disabled:cursor-default disabled:bg-stone-300"
          >
            <ArrowUp size={15} />
          </button>
        </div>
      </form>
    </aside>
  )
}
