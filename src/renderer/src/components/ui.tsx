import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-strong border border-accent',
  secondary: 'bg-white text-stone-800 border border-stone-300 hover:bg-stone-50',
  ghost: 'text-stone-600 hover:bg-stone-200/60 border border-transparent',
  danger: 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }): ReactNode {
  const pad = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  return (
    <button
      className={`inline-flex items-center gap-1.5 rounded-md font-medium transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${pad} ${variants[variant]} ${className}`}
      {...rest}
    />
  )
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return (
    <input
      className={`w-full rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 ${className}`}
      {...rest}
    />
  )
}

export function Textarea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>): ReactNode {
  return (
    <textarea
      dir="auto"
      className={`w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 ${className}`}
      {...rest}
    />
  )
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }): ReactNode {
  return (
    <div className="mb-1.5">
      <div className="text-sm font-medium text-stone-800">{children}</div>
      {hint && <div className="text-xs text-stone-500">{hint}</div>}
    </div>
  )
}

type Tone = 'neutral' | 'success' | 'danger' | 'warning' | 'accent'
const tones: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-700',
  success: 'bg-emerald-50 text-emerald-800',
  danger: 'bg-rose-50 text-rose-800',
  warning: 'bg-amber-50 text-amber-800',
  accent: 'bg-accent-soft text-accent'
}

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }): ReactNode {
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${tones[tone]}`}>
      {children}
    </span>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }): ReactNode {
  return <div className={`rounded-md border border-stone-200 bg-white ${className}`}>{children}</div>
}

export function Toggle({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
}): ReactNode {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700 select-none">
      <span
        onClick={() => onChange(!checked)}
        className={`relative inline-block h-5 w-9 rounded-full transition ${checked ? 'bg-accent' : 'bg-stone-300'}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-[18px]' : 'left-0.5'}`}
        />
      </span>
      <span onClick={() => onChange(!checked)}>{label}</span>
    </label>
  )
}

export function PageHeader({
  title,
  subtitle,
  actions
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
}): ReactNode {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 border-b border-stone-900 pb-4">
      <div>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.02em] text-balance text-stone-900">{title}</h1>
        {subtitle && <div className="mt-1 max-w-[70ch] text-sm text-stone-600">{subtitle}</div>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}
