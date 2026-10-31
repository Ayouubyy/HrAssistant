export function parseModelJson(raw: string): unknown {
  const text = raw.replace(/```(?:json)?/gi, '').trim()
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) throw new Error('The AI response was not valid JSON')
    return JSON.parse(text.slice(start, end + 1))
  }
}

export function clamp100(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(100, Math.round(v)))
}

export const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

export const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
