import type { ReviewFlag } from '../../shared/types'

// Zero-width, bidi-control and other invisible characters used to split words past a filter.
const INVISIBLE = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g
const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g

export function normalizeForScan(text: string): string {
  return text
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(TASHKEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .toLowerCase()
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

interface Pattern {
  re: RegExp
  strong: boolean
  what: string
}

// Patterns run on normalizeForScan output (lowercase, alef unified, no diacritics).
const PATTERNS: Pattern[] = [
  // English
  { re: /\b(ignore|disregard|forget|override)\b.{0,30}\b(previous|prior|above|earlier|all|any|the)\b.{0,20}\b(instructions?|rules?|rubric|prompts?|criteria|guidelines)\b/, strong: true, what: 'asks the AI to ignore its instructions' },
  { re: /\byou are now\b|\bfrom now on,? you\b|\bnew instructions?\s*:/, strong: true, what: 'tries to give the AI a new role' },
  { re: /\b(system|developer) (prompt|message|instructions?)\b/, strong: true, what: 'mentions the system prompt' },
  { re: /\b(give|assign|rate|score|grade|mark)\b.{0,25}\b(this candidate|this cv|this applicant|me|him|her)\b.{0,25}(\b100\b|maximum|highest|perfect|top score|full marks)/, strong: true, what: 'asks for a maximum score' },
  { re: /\bscore\s*[:=]\s*100\b|\b100\s*\/\s*100\b|\bsubscores?\s*[:=]/, strong: true, what: 'writes its own score' },
  { re: /\b(this|the) (candidate|applicant) (is|must be rated) (perfect|the best|an ideal|a perfect)/, strong: true, what: 'tells the AI the candidate is perfect' },
  { re: /\b(note|message|instruction)s? (to|for) (the )?(ai|assistant|screening|recruit\w*|hr) (system|tool|bot|model|assistant)\b/, strong: true, what: 'addresses the screening tool directly' },
  { re: /\bact as\b|\bpretend (to be|you are)\b|\bas an ai\b|\blanguage model\b/, strong: false, what: 'talks to an AI' },
  { re: /\b(chatgpt|gpt-?\d|gemini|claude|llm|openai)\b/, strong: false, what: 'names an AI model' },
  // French
  { re: /\bignore[rz]?\b.{0,20}\b(les|toutes les|tes|vos)\b.{0,15}\b(instructions|consignes|regles|règles)\b/, strong: true, what: 'asks the AI to ignore its instructions (FR)' },
  { re: /\b(oublie[rz]?|ne tiens pas compte)\b.{0,30}\b(instructions|consignes|regles|règles|critères|criteres)\b/, strong: true, what: 'asks the AI to ignore its instructions (FR)' },
  { re: /\b(tu es|vous etes|vous êtes) (maintenant|desormais|désormais)\b/, strong: true, what: 'tries to give the AI a new role (FR)' },
  { re: /\b(attribue|donne|accorde|mets?)[rz]?\b.{0,30}\b(note|score)\b.{0,15}(maximale|maximum|de 100|parfaite|\b100\b)/, strong: true, what: 'asks for a maximum score (FR)' },
  { re: /\bce (candidat|profil) est (parfait|idéal|ideal|le meilleur)\b/, strong: true, what: 'tells the AI the candidate is perfect (FR)' },
  // Arabic (alef forms unified to ا, no tashkeel)
  { re: /تجاهل.{0,20}(التعليمات|الاوامر|القواعد|المعايير)/, strong: true, what: 'asks the AI to ignore its instructions (AR)' },
  { re: /(انت|انتم) (الان|من الان)/, strong: true, what: 'tries to give the AI a new role (AR)' },
  { re: /اعط(ه|ي|وه)?.{0,25}(اعلي|اعلى|الدرجة القصوى|الدرجه القصوي|العلامة الكاملة|100)/, strong: true, what: 'asks for a maximum score (AR)' },
  { re: /(هذا|هذه) (المرشح|المرشحة|المترشح) (مثالي|مثالية|الافضل)/, strong: true, what: 'tells the AI the candidate is perfect (AR)' },
  // Structural: chat-template markers and our own delimiters
  { re: /(^|\s)(system|assistant|user)\s*:\s*\S/, strong: false, what: 'contains a chat role marker' },
  { re: /<\|[a-z_]*\|?>|\[\/?inst\]|###\s*(instruction|system)|<\/?(cv_document|email_document|record)>/, strong: true, what: 'contains AI prompt markup' }
]

const excerpt = (s: string, i: number, len: number): string => {
  const from = Math.max(0, i - 40)
  return `${from > 0 ? '…' : ''}${s.slice(from, i + len + 40).trim()}${i + len + 40 < s.length ? '…' : ''}`.slice(0, 120)
}

export function scanInjection(text: string, where = 'This CV'): ReviewFlag[] {
  const norm = normalizeForScan(text)
  const hits: { p: Pattern; index: number; len: number }[] = []
  for (const p of PATTERNS) {
    const m = p.re.exec(norm)
    if (m) hits.push({ p, index: m.index, len: m[0].length })
  }
  if (!hits.length) return []
  const strong = hits.filter((h) => h.p.strong)
  const shown = strong.length ? strong : hits
  return shown.slice(0, 2).map((h) => ({
    code: 'injection_phrase' as const,
    severity: strong.length ? ('high' as const) : ('info' as const),
    detail: `${where} ${h.p.what}.`,
    evidence: excerpt(norm, h.index, h.len)
  }))
}

// Our prompt delimiters must never appear inside untrusted text, or it could close the block early.
export const stripDelimiters = (text: string): string =>
  text.replace(/<\/?\s*(cv_document|email_document|record)\b[^>]*>/gi, '')
