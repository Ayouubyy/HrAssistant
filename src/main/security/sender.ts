import type { ReviewFlag, SenderAuth } from '../../shared/types'

export const addressOf = (from: string): string => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase()
export const domainOf = (from: string): string => addressOf(from).split('@')[1]?.replace(/[>\s]/g, '') ?? ''
export const displayNameOf = (from: string): string => from.replace(/<[^>]*>/, '').replace(/"/g, '').trim()

// Only the topmost Authentication-Results added by mx.google.com counts: headers further down
// were written before the message reached Google, so a sender can forge them.
export function parseAuthResults(headers: string[]): SenderAuth {
  const top = headers.find((h) => /^\s*mx\.google\.com\s*;/i.test(h))
  if (!top) return { spf: null, dkim: null, dmarc: null, verdict: 'unknown' }
  const get = (k: string): string | null => top.match(new RegExp(`\\b${k}=([a-z]+)`, 'i'))?.[1].toLowerCase() ?? null
  const spf = get('spf')
  const dkim = get('dkim')
  const dmarc = get('dmarc')
  const verdict =
    dmarc === 'fail' ? 'spoofed' : dmarc === 'pass' || (dkim === 'pass' && spf === 'pass') ? 'verified' : 'unverified'
  return { spf, dkim, dmarc, verdict }
}

export function authFlags(auth: SenderAuth): ReviewFlag[] {
  if (auth.verdict === 'spoofed')
    return [{ code: 'sender_spoofed', severity: 'high', detail: "Gmail couldn't confirm this sender. The From address is probably forged (DMARC failed)." }]
  if (auth.verdict === 'unverified')
    return [
      {
        code: 'sender_unverified',
        severity: 'warn',
        detail: `Gmail couldn't fully verify the sender (SPF ${auth.spf ?? 'none'}, DKIM ${auth.dkim ?? 'none'}, DMARC ${auth.dmarc ?? 'none'}).`
      }
    ]
  return []
}

const HOMOGLYPHS: [RegExp, string][] = [
  [/rn/g, 'm'],
  [/vv/g, 'w'],
  [/0/g, 'o'],
  [/1/g, 'l'],
  [/[ıі]/g, 'i'],
  [/[а]/g, 'a'],
  [/[е]/g, 'e'],
  [/[о]/g, 'o'],
  [/[р]/g, 'p'],
  [/[с]/g, 'c'],
  [/[х]/g, 'x'],
  [/[у]/g, 'y']
]

const skeleton = (d: string): string => HOMOGLYPHS.reduce((s, [re, to]) => s.replace(re, to), d.normalize('NFKC').toLowerCase())

// "company.tn" → "company": the part people actually read.
const label = (d: string): string => {
  const parts = d.split('.')
  const sld = ['com', 'co', 'org', 'net', 'gov', 'edu', 'ac']
  return parts.length >= 3 && sld.includes(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2] ?? d
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) dp[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[a.length][b.length]
}

export function isCompanyDomain(domain: string, companyDomains: string[]): boolean {
  const d = domain.toLowerCase()
  return companyDomains.some((c) => d === c.toLowerCase() || d.endsWith(`.${c.toLowerCase()}`))
}

export function lookalikeOf(domain: string, companyDomains: string[]): string | null {
  const d = domain.toLowerCase()
  if (!d || isCompanyDomain(d, companyDomains)) return null
  for (const raw of companyDomains) {
    const c = raw.toLowerCase().trim()
    if (!c) continue
    if (skeleton(d) === skeleton(c)) return c
    const dl = label(d)
    const cl = label(c)
    if (cl.length >= 4 && (skeleton(dl) === skeleton(cl) || editDistance(dl, cl) <= (cl.length >= 8 ? 2 : 1))) return c
    // company-tn.com, company.tn.example.com, mycompany-rh.net…
    if (cl.length >= 5 && d.replace(/[^a-z0-9]/g, '').includes(cl) && !d.endsWith(c)) return c
  }
  return null
}

const INTERNAL_NAMES =
  /\b(direction|directeur|directrice|ressources humaines|human resources|\bhr\b|\brh\b|service rh|ceo|pdg|dg|cfo|daf|comptabilit[ée]|payroll|paie|finance|it support|helpdesk)\b|الموارد البشرية|المدير|الإدارة/i

const DISPOSABLE = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.info',
  '10minutemail.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmailo.com',
  'yopmail.com',
  'yopmail.fr',
  'trashmail.com',
  'sharklasers.com',
  'getnada.com',
  'dispostable.com',
  'maildrop.cc',
  'throwawaymail.com',
  'fakeinbox.com',
  'mohmal.com',
  'emailondeck.com',
  'mintemail.com',
  'spamgourmet.com'
])

export function senderFlags(from: string, companyDomains: string[]): ReviewFlag[] {
  const flags: ReviewFlag[] = []
  const domain = domainOf(from)
  const like = lookalikeOf(domain, companyDomains)
  if (like)
    flags.push({
      code: 'lookalike_domain',
      severity: 'high',
      detail: `The sender's domain looks like your company's (${like}) but isn't.`,
      evidence: domain
    })
  const name = displayNameOf(from)
  if (companyDomains.length && domain && !isCompanyDomain(domain, companyDomains) && INTERNAL_NAMES.test(name))
    flags.push({
      code: 'lookalike_domain',
      severity: 'high',
      detail: 'The sender uses an internal-sounding name from an outside address.',
      evidence: from.slice(0, 120)
    })
  if (DISPOSABLE.has(domain))
    flags.push({ code: 'disposable_domain', severity: 'info', detail: 'The sender uses a throwaway email address.', evidence: domain })
  return flags
}

export function replyToFlags(from: string, replyTo: string | undefined): ReviewFlag[] {
  if (!replyTo) return []
  const a = domainOf(from)
  const b = domainOf(replyTo)
  if (!b || a === b) return []
  return [
    {
      code: 'reply_to_mismatch',
      severity: 'high',
      detail: `Replies would go to ${addressOf(replyTo)}, not to the sender's domain (${a}).`,
      evidence: addressOf(replyTo)
    }
  ]
}

const URL = /\b(?:https?:\/\/|www\.)[^\s<>"')]+/gi
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

// A link or address in the AI's draft that wasn't in the email or a company domain.
export function draftLinkFlags(draft: string | null, emailText: string, from: string, companyDomains: string[]): ReviewFlag[] {
  if (!draft) return []
  const known = `${emailText} ${from}`.toLowerCase()
  const found = [...(draft.match(URL) ?? []), ...(draft.match(EMAIL) ?? [])].filter((x) => {
    const host = (x.includes('@') ? x.split('@')[1] : x.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/:?#]/)[0]).toLowerCase()
    return !known.includes(x.toLowerCase()) && !isCompanyDomain(host, companyDomains)
  })
  if (!found.length) return []
  return [
    {
      code: 'draft_has_link',
      severity: 'warn',
      detail: "The draft reply contains a link or address that wasn't in the email. Check it before sending.",
      evidence: [...new Set(found)].join(', ').slice(0, 120)
    }
  ]
}
