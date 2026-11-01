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

// The candidate's name, found locally so the CV can go to the AI without it (T-15, council review: the
// bias check showed scores moving with the name). It's the first of the top lines that looks like a
// person's name: 2 to 5 capitalised (or Arabic) words, no digits, no job or section words. A line like
// "Karim Benali - Credit analyst" gives its first part. Returns null when unsure; the name then stays in.
const HEADING = /^(?:cv|c\.v\.?|curriculum vit(?:ae|æ)|r[ée]sum[ée]|السيرة الذاتية|سيرة ذاتية)$/i
const PARTICLES = new Set(['de', 'du', 'des', 'da', 'di', 'del', 'van', 'von', 'der', 'le', 'la', 'el', 'al', 'ben', 'bin', 'ibn', 'bint', 'ait', 'aït', 'ou'])
const NOT_NAME = new Set(
  (
    'cv curriculum vitae résumé resume profile profil contact contacts experience expérience expériences formation ' +
    'education éducation skills compétences languages langues summary objective objectif about ' +
    'analyst analyste engineer ingénieur ingénieure developer développeur développeuse manager accountant comptable ' +
    'assistant assistante chargé chargée consultant consultante director directeur directrice responsable officer ' +
    'intern stagiaire technician technicien technicienne commercial commerciale scientist designer auditor auditeur ' +
    'auditrice junior senior lead head chef specialist spécialiste expert experte credit crédit finance financial ' +
    'financier financière risk risque risques sales marketing data software logiciel project projet banking bancaire ' +
    'client clientèle business hr rh ressources humaines human resources ' +
    'محلل محللة مهندس مهندسة مدير مديرة محاسب محاسبة مطور مطورة مساعد مساعدة مسؤول مسؤولة السيرة الذاتية سيرة ذاتية ' +
    'الخبرة الخبرات التعليم التكوين المهارات اللغات ائتمان الائتمان مالي مالية المالية'
  ).split(' ')
)
const ARABIC = /[؀-ۿ]/

function looksLikeName(s: string): boolean {
  if (s.length < 3 || s.length > 60 || /[\d@:/()[\]]/.test(s)) return false
  const words = s.split(/\s+/)
  if (words.length < 2 || words.length > 5) return false
  if (words.some((w) => NOT_NAME.has(w.toLowerCase()))) return false
  if (ARABIC.test(s)) return words.every((w) => /^[ء-ي]+$/.test(w))
  const named = words.filter((w) => !PARTICLES.has(w.toLowerCase()))
  return named.length >= 2 && named.every((w) => /^\p{Lu}[\p{L}'’.-]*$/u.test(w))
}

// A name further down (below a sidebar, say) counts only if the CV's email address contains part of it.
export function findName(text: string): string | null {
  const local = (text.match(EMAIL)?.[0].split('@')[0] ?? '').toLowerCase()
  const inEmail = (s: string): boolean => s.split(/\s+/).some((w) => w.length >= 3 && local.includes(w.toLowerCase()))
  const names = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !HEADING.test(l))
    .slice(0, 10)
    .map((l, i) => ({ i, name: l.split(/\s+[-–—|·•,]\s+|\s*[|·•]\s*/)[0].trim() }))
    .filter((x) => looksLikeName(x.name))
  return (names.find((x) => inEmail(x.name)) ?? names.find((x) => x.i < 4))?.name ?? null
}

// Every occurrence of the name, in its order and reversed ("BENALI Karim"), case-insensitive.
export function redactName(text: string, name: string): string {
  const words = name.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const pattern = (ws: string[]): string => `(?<!\\p{L})${ws.join('\\s+')}(?!\\p{L})`
  return text.replace(new RegExp(`${pattern(words)}|${pattern([...words].reverse())}`, 'giu'), '[name]')
}

// What the AI receives for a CV or an email. Contacts are read from the original text so HR still sees them.
export function redactForAi(text: string): { text: string; email: string | null; phone: string | null } {
  const { email, phone } = redactContacts(text)
  return { text: redactContacts(redactPersonal(text)).text, email, phone }
}
