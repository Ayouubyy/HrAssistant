import type { ReactNode } from 'react'

export const HELPER_NAME = 'Nour'

type Mood = 'idle' | 'thinking' | 'happy'

// Nour, the assistant's face: a small helmeted helper drawn from simple shapes.
export function Helper({ size = 40, mood = 'idle', title }: { size?: number; mood?: Mood; title?: string }): ReactNode {
  const eyeY = mood === 'thinking' ? 27.5 : 29
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className="shrink-0"
    >
      <line x1="32" y1="9" x2="32" y2="4" stroke="#161918" strokeWidth="2" strokeLinecap="round" />
      <circle cx="32" cy="3.5" r="2.8" fill="#e3b23c" />
      <circle cx="9.5" cy="31" r="3.5" fill="#e3b23c" />
      <circle cx="54.5" cy="31" r="3.5" fill="#e3b23c" />
      <circle cx="32" cy="32" r="23" fill="#ffffff" stroke="#161918" strokeWidth="2" />
      <rect x="15" y="20" width="34" height="21" rx="10.5" fill="#1f4e5f" />
      {mood === 'happy' ? (
        <>
          <path d="M23.5 30 Q26 26.8 28.5 30" stroke="#fbf3dc" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          <path d="M35.5 30 Q38 26.8 40.5 30" stroke="#fbf3dc" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <ellipse className="helper-eye" cx="26" cy={eyeY} rx="2.4" ry="3.3" fill="#fbf3dc" />
          <ellipse className="helper-eye" cx="38" cy={eyeY} rx="2.4" ry="3.3" fill="#fbf3dc" />
        </>
      )}
      <path
        d={mood === 'thinking' ? 'M28.5 35.5 L35.5 35.5' : 'M27 34.5 Q32 38.5 37 34.5'}
        stroke="#fbf3dc"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="21" y="53" width="22" height="8" rx="4" fill="#ffffff" stroke="#161918" strokeWidth="2" />
      <rect x="28" y="55.5" width="8" height="3" rx="1.5" fill="#c43325" />
    </svg>
  )
}

// The name plate that sits beside the helper, like a staff badge.
export function HelperPlate({ line }: { line?: string }): ReactNode {
  return (
    <div className="min-w-0 leading-tight">
      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold text-stone-900">{HELPER_NAME}</span>
        <span className="text-xs text-stone-500">HR assistant</span>
      </div>
      {line && <div className="mt-0.5 text-xs text-stone-500">{line}</div>}
    </div>
  )
}

export function ThinkingDots(): ReactNode {
  return (
    <span className="inline-flex gap-1" aria-label="Thinking">
      {[0, 1, 2].map((i) => (
        <span key={i} className="helper-dot h-1.5 w-1.5 rounded-full bg-stone-500" />
      ))}
    </span>
  )
}
