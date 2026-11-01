import { constants, inflateRawSync } from 'zlib'
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
  // compression method (0 stored, 8 deflate) and where the entry's local header starts
  method?: number
  offset?: number
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
    out.push({
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
      compressed,
      uncompressed,
      method: buf.readUInt16LE(p + 10),
      offset: buf.readUInt32LE(p + 42)
    })
    p += 46 + nameLen + extra + comment
  }
  return out
}

const BOMB = "This Word file expands to an unusual size, so it wasn't opened."

// Refuses zip bombs before mammoth or jszip inflate anything. The declared sizes can lie, so with the
// file's bytes every entry is also inflated for real, and inflation stops at the 50 MB limit.
export function checkZipBomb(entries: ZipEntry[], buf?: Buffer): void {
  const total = entries.reduce((s, e) => s + e.uncompressed, 0)
  const packed = entries.reduce((s, e) => s + e.compressed, 0)
  if (total > LIMITS.docxUncompressed || (packed > 0 && total / packed > LIMITS.docxRatio && total > 5 * 1024 * 1024))
    throw new TooLargeError(BOMB)
  if (buf) inflatedSize(buf, entries)
}

function inflatedSize(buf: Buffer, entries: ZipEntry[]): number {
  let total = 0
  for (const e of entries) {
    const at = e.offset ?? -1
    if (at < 0 || at + 30 > buf.length || buf.readUInt32LE(at) !== 0x04034b50) continue
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28)
    const data = buf.subarray(start, Math.min(buf.length, start + e.compressed))
    if (e.method === 0) total += data.length
    else if (e.method === 8) {
      try {
        total += inflateRawSync(data, { maxOutputLength: LIMITS.docxUncompressed - total + 1, finishFlush: constants.Z_SYNC_FLUSH }).length
      } catch (err) {
        if (err instanceof RangeError || (err as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') throw new TooLargeError(BOMB)
        // a damaged entry: the Word reader reports it
      }
    }
    if (total > LIMITS.docxUncompressed) throw new TooLargeError(BOMB)
  }
  return total
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
