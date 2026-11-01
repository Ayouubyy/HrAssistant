// Removes personal details the AI doesn't need, before any text is sent to it (T-15, T-24).
// Work date ranges ("2019 – 2023") and years of experience ("10 ans d'expérience") are kept.

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE = /\+?\d[\d \t().-]{7,18}\d/g
const YEAR_RANGE = /^(19|20)\d\d\s*[-–]\s*(19|20)\d\d$/
const IBAN = /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g
const RIB = /\b\d{2}[ .-]?\d{3}[ .-]?\d{13}[ .-]?\d{2}\b/g
const SOCIAL =
  /\b(?:https?:\/\/)?(?:[a-z]{2,3}\.)?(?:linkedin\.com|facebook\.com|fb\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|t\.me)\/[^\s,;)]+/gi

// A line that starts with a personal attribute label, in EN/FR/AR.
const PERSONAL_LINE = new RegExp(
  `^[\\s•·*–-]*(?:${[
    'date of birth',
    'birth ?date',
    'born\\b',
    'd\\.?o\\.?b\\b',
    'n[ée]e? le\\b',
    'n[ée]\\(e\\) le\\b',
    'date de naissance',
    'lieu de naissance',
    'place of birth',
    'nationalit[yé]',
    'citizenship',
    'marital status',
    'situation (?:familiale|matrimoniale)',
    '[ée]tat civil',
    'gender\\s*[:：]',
    'sexe\\s*[:：]',
    'religion\\s*[:：]',
    '[âa]ge\\s*[:：]',
    'تاريخ الميلاد',
    'تاريخ الازدياد',
    'مكان الميلاد',
    'مواليد',
    'الجنسية',
    'الحالة (?:العائلية|الاجتماعية|المدنية)',
    'الجنس\\s*[:：]',
    'الديانة',
    'العمر\\s*[:：]',
    'السن\\s*[:：]'
  ].join('|')})`,
  'i'
)
const AGE = /\b\d{2}\s?years? old\b|(?:\bâge|\bage|العمر|السن)\s*[:：]?\s*\d{2}(?:\s?(?:ans|years|سنة|عاما))?/gi
const ADDRESS_LINE =
  /^[\s•·*–-]*(?:adresse|address|domicile|العنوان|عنوان)\s*[:：]|\b\d{1,4}\s?(?:bis|ter)?,?\s+(?:rue|avenue|av\.|bd|boulevard|street|st\.|road|rd\.|cité|impasse|chemin)\b|(?:^|\s)(?:rue|avenue|شارع|نهج|حي)\s+[^\n]{2,40}\b\d{4,5}\b/i

export function redactContacts(text: string): { text: string; email: string | null; phone: string | null } {
  const email = text.match(EMAIL)?.[0] ?? null
  let phone: string | null = null
  const out = text.replace(EMAIL, '[email]').replace(PHONE, (m) => {
    if (m.replace(/\D/g, '').length < 9 || YEAR_RANGE.test(m.trim())) return m
    phone ??= m.trim()
    return '[phone]'
  })
  return { text: out, email, phone }
}

export function redactPersonal(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (line.length < 160 && PERSONAL_LINE.test(line)) return '[personal detail removed]'
      if (line.length < 160 && ADDRESS_LINE.test(line)) return '[address removed]'
      return line
    })
    .join('\n')
    .replace(AGE, '[age]')
    .replace(SOCIAL, '[profile link]')
    .replace(IBAN, '[bank account]')
    .replace(RIB, '[bank account]')
}

// What the AI receives for a CV or an email. Contacts are read from the original text so HR still sees them.
export function redactForAi(text: string): { text: string; email: string | null; phone: string | null } {
  const { email, phone } = redactContacts(text)
  return { text: redactContacts(redactPersonal(text)).text, email, phone }
}
