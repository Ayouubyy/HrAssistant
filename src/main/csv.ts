function cell(v: unknown, sep: string): string {
  let s = String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return s.includes(sep) || /["\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows: unknown[][], sep: string): string {
  return rows.map((r) => r.map((v) => cell(v, sep)).join(sep)).join('\r\n')
}

// Excel splits CSV columns on the OS list separator, which is ";" in most non-English locales.
export function csvSeparator(locale: string): string {
  return /^(en|ja|ko|zh|he|th)\b/i.test(locale) ? ',' : ';'
}
