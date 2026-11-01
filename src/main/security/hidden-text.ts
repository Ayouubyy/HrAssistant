import JSZip from 'jszip'
import type { ReviewFlag } from '../../shared/types'

const decode = (s: string): string =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&')

const nearWhite = (hex: string): boolean => {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  return !!m && m.slice(1).every((c) => parseInt(c, 16) >= 0xf0)
}

function runIsHidden(run: string): boolean {
  const pr = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? ''
  if (/<w:vanish(\s*\/>|\s+w:val="(true|1|on)"\s*\/>)/.test(pr)) return true
  const color = pr.match(/<w:color\s+w:val="([0-9A-Fa-f]{6})"/)?.[1]
  if (color && nearWhite(color)) return true
  const size = pr.match(/<w:sz\s+w:val="(\d+)"/)?.[1]
  return size != null && Number(size) < 8 // half-points: under 4 pt
}

// Removes runs a reader can't see (hidden, white, under 4 pt) and returns their text.
export async function stripHiddenDocx(bytes: Buffer): Promise<{ bytes: Buffer; hidden: string }> {
  const zip = await JSZip.loadAsync(bytes)
  const doc = zip.file('word/document.xml')
  if (!doc) return { bytes, hidden: '' }
  const xml = await doc.async('string')
  const hidden: string[] = []
  const cleaned = xml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run) => {
    if (!runIsHidden(run)) return run
    const text = [...run.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => decode(m[1])).join('')
    if (text.trim()) hidden.push(text)
    return ''
  })
  if (!hidden.length) return { bytes, hidden: '' }
  zip.file('word/document.xml', cleaned)
  return { bytes: await zip.generateAsync({ type: 'nodebuffer' }), hidden: hidden.join(' ').replace(/\s+/g, ' ').trim() }
}

// pdf.js operator codes (pdfjs-dist 5.x OPS).
const OPS = {
  save: 10,
  restore: 11,
  setTextRenderingMode: 38,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  setFillGray: 57,
  setFillRGBColor: 59
}

interface TextItem {
  str: string
  transform: number[]
}
interface PdfPage {
  view: number[]
  getTextContent(): Promise<{ items: (TextItem | object)[] }>
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[][] }>
}
export interface PdfDoc {
  numPages: number
  getPage(n: number): Promise<PdfPage>
}

const isWhite = (args: unknown[]): boolean => {
  const [a, b, c] = args
  if (typeof a === 'string') return nearWhite(a)
  if (typeof a === 'number' && args.length === 1) return a >= 0.94 || a >= 240
  if ([a, b, c].every((x) => typeof x === 'number')) {
    const max = Math.max(a as number, b as number, c as number) > 1 ? 255 : 1
    return [a, b, c].every((x) => (x as number) / max >= 0.94)
  }
  return false
}

const glyphText = (args: unknown[]): string => {
  const glyphs = Array.isArray(args[0]) ? (args[0] as unknown[]) : []
  return glyphs
    .map((g) =>
      g && typeof g === 'object' && 'unicode' in g ? String((g as { unicode: string }).unicode) : typeof g === 'number' && g < -200 ? ' ' : ''
    )
    .join('')
}

// Text under 4 pt, outside the page, in white, or drawn with invisible render mode.
export async function pdfHiddenText(doc: PdfDoc, maxPages: number): Promise<{ tiny: string[]; white: string[] }> {
  const tiny: string[] = []
  const white: string[] = []
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n)
    const [x0, y0, x1, y1] = page.view
    for (const item of (await page.getTextContent()).items) {
      if (!('str' in item) || !item.str.trim()) continue
      const [a, b, , , e, f] = item.transform
      const size = Math.hypot(a, b)
      const offPage = e < x0 - 5 || e > x1 + 5 || f < y0 - 5 || f > y1 + 5
      if (size < 4 || offPage) tiny.push(item.str)
    }
    const ops = await page.getOperatorList()
    let fillWhite = false
    let invisible = false
    const stack: [boolean, boolean][] = []
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i]
      const args = ops.argsArray[i] ?? []
      if (fn === OPS.save) stack.push([fillWhite, invisible])
      else if (fn === OPS.restore) [fillWhite, invisible] = stack.pop() ?? [false, false]
      else if (fn === OPS.setFillRGBColor || fn === OPS.setFillGray) fillWhite = isWhite(args)
      else if (fn === OPS.setTextRenderingMode) invisible = args[0] === 3 || args[0] === 7
      else if (
        (fillWhite || invisible) &&
        (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText)
      ) {
        const t = glyphText(fn === OPS.nextLineSetSpacingShowText ? args.slice(2) : args)
        if (t.trim()) white.push(t)
      }
    }
  }
  return { tiny, white }
}

export const joinFragments = (xs: string[]): string => xs.join(' ').replace(/\s+/g, ' ').trim()

export function hiddenTextFlag(hidden: string, how: string): ReviewFlag[] {
  if (hidden.replace(/\s/g, '').length < 15) return []
  return [
    {
      code: 'hidden_text',
      severity: 'high',
      detail: `This CV contains ${how} text a reader can't see. It was left out of the score.`,
      evidence: hidden.slice(0, 120)
    }
  ]
}

// Removes hidden fragments from extracted page text so the model only scores what a human sees.
// Whitespace is ignored when matching, since pdf.js spaces glyphs and text items differently.
export function removeFragments(text: string, fragments: string[]): string {
  let out = text
  for (const frag of fragments) {
    const chars = [...frag.replace(/\s+/g, '')]
    if (chars.length < 4) continue
    const re = new RegExp(chars.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'g')
    out = out.replace(re, ' ')
  }
  return out
}
