import JSZip from 'jszip'
import type { ReviewFlag } from '../../shared/types'

export const LIMITS = {
  cvBytes: 10 * 1024 * 1024,
  attachmentBytes: 25 * 1024 * 1024,
  emailBytes: 30 * 1024 * 1024,
  docxUncompressed: 50 * 1024 * 1024,
  docxRatio: 100,
  pdfPages: 30,
  modelChars: 100_000,
  extractMs: 20_000,
  filesPerDrop: 500
}

export class TooLargeError extends Error {}

const mb = (n: number): string => `${Math.round(n / 1024 / 1024)} MB`

export function checkSize(bytes: number, max: number, what: string): void {
  if (bytes > max) throw new TooLargeError(`This ${what} is larger than ${mb(max)}, so it wasn't opened.`)
}

export interface ZipEntry {
  name: string
  compressed: number
  uncompressed: number
}

// Reads a zip's central directory without decompressing anything.
export function zipEntries(buf: Buffer): ZipEntry[] {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a valid Word file.')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const out: ZipEntry[] = []
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break
    const compressed = buf.readUInt32LE(p + 20)
    const uncompressed = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extra = buf.readUInt16LE(p + 30)
    const comment = buf.readUInt16LE(p + 32)
    out.push({ name: buf.toString('utf8', p + 46, p + 46 + nameLen), compressed, uncompressed })
    p += 46 + nameLen + extra + comment
  }
  return out
}

// Refuses zip bombs before mammoth or jszip inflate anything.
export function checkZipBomb(entries: ZipEntry[]): void {
  const total = entries.reduce((s, e) => s + e.uncompressed, 0)
  const packed = entries.reduce((s, e) => s + e.compressed, 0)
  if (total > LIMITS.docxUncompressed || (packed > 0 && total / packed > LIMITS.docxRatio && total > 5 * 1024 * 1024))
    throw new TooLargeError("This Word file expands to an unusual size, so it wasn't opened.")
}

const PDF_MARKERS: { re: RegExp; severity: ReviewFlag['severity']; what: string }[] = [
  { re: /\/JavaScript\b|\/JS\b/, severity: 'high', what: 'JavaScript' },
  { re: /\/Launch\b/, severity: 'high', what: 'a command that launches a program' },
  { re: /\/EmbeddedFiles?\b/, severity: 'high', what: 'an embedded file' },
  { re: /\/OpenAction\b|\/AA\b/, severity: 'warn', what: 'an action that runs when it opens' },
  { re: /\/RichMedia\b/, severity: 'warn', what: 'embedded media' },
  { re: /\/XFA\b/, severity: 'warn', what: 'an XFA form' }
]

export function scanPdfBytes(bytes: Buffer): ReviewFlag[] {
  const raw = bytes.toString('latin1')
  const found = PDF_MARKERS.filter((m) => m.re.test(raw))
  if (!found.length) return []
  const severity = found.some((f) => f.severity === 'high') ? 'high' : 'warn'
  return [
    {
      code: 'active_content',
      severity,
      detail: `This PDF contains ${found.map((f) => f.what).join(', ')}. Normal CVs don't. Open it with care.`
    }
  ]
}

export async function scanDocx(bytes: Buffer, entries: ZipEntry[]): Promise<ReviewFlag[]> {
  const found: string[] = []
  const names = entries.map((e) => e.name.toLowerCase())
  if (names.some((n) => n.endsWith('vbaproject.bin'))) found.push('macros')
  if (names.some((n) => /activex/.test(n))) found.push('ActiveX controls')
  if (names.some((n) => /oleobject/.test(n) || /\/embeddings\//.test(n))) found.push('embedded objects')
  const zip = await JSZip.loadAsync(bytes)
  for (const name of Object.keys(zip.files).filter((n) => n.endsWith('.rels'))) {
    const xml = await zip.files[name].async('string')
    if (/TargetMode\s*=\s*"External"/i.test(xml) && /Type="[^"]*(attachedTemplate|oleObject|frame|subDocument)"/i.test(xml)) {
      found.push('a link that loads content from the internet')
      break
    }
  }
  if (!found.length) return []
  return [
    {
      code: 'active_content',
      severity: 'high',
      detail: `This Word file contains ${[...new Set(found)].join(', ')}. Normal CVs don't. Open it with care.`
    }
  ]
}
