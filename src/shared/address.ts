// From-header helpers. The real address is the LAST <…> group: a display name can itself contain
// "<ceo@company>" to hide the address that actually sent the mail.
const LAST = /<([^<>]*)>\s*$/

export const addressOf = (from: string): string => (from.match(LAST)?.[1] ?? from).replace(/"/g, '').trim().toLowerCase()
export const domainOf = (from: string): string => addressOf(from).split('@')[1]?.replace(/[>\s]/g, '') ?? ''
export const displayNameOf = (from: string): string =>
  (LAST.test(from) ? from.replace(LAST, '') : '').replace(/"/g, '').trim()

const ADDRESS_LIKE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|ma|tn|fr|dz|io|co)\b/gi

// An address or domain in the display name that isn't the real sender's.
export function nameHidesAddress(from: string): string | null {
  const real = addressOf(from)
  const domain = domainOf(from)
  for (const m of displayNameOf(from).match(ADDRESS_LIKE) ?? []) {
    const x = m.toLowerCase()
    if (x !== real && x !== domain) return m
  }
  return null
}
