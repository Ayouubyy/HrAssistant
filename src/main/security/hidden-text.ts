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

// A background white text can be read on (relative luminance under one half).
const isDarkHex = (hex: string | undefined): boolean => {
  const m = hex?.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return false
  const [r, g, b] = m.slice(1).map((c) => parseInt(c, 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5
}

const DARK_HIGHLIGHT = /<w:highlight\s+w:val="(black|darkBlue|darkCyan|darkGreen|darkMagenta|darkRed|darkGray|blue|red|green|magenta)"/
const shdFill = (xml: string): string | undefined => xml.match(/<w:shd\b[^>]*w:fill="([0-9A-Fa-f]{6})"/)?.[1]

// Parts of document.xml drawn on a dark background: shaded table cells and paragraphs, dark shapes
// and text boxes (the sidebar of many CV templates), or a dark page. White text there is visible.
function darkRanges(xml: string): [number, number][] {
  if (isDarkHex(xml.match(/<w:background\b[^>]*w:color="([0-9A-Fa-f]{6})"/)?.[1])) return [[0, xml.length]]
  const out: [number, number][] = []
  const add = (re: RegExp, dark: (s: string) => boolean): void => {
    for (const m of xml.matchAll(re)) if (dark(m[0])) out.push([m.index, m.index + m[0].length])
  }
  add(/<w:tc\b[\s\S]*?<\/w:tc>/g, (s) => isDarkHex(shdFill(s.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/)?.[0] ?? '')))
  add(/<w:p\b[\s\S]*?<\/w:p>/g, (s) => isDarkHex(shdFill(s.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)?.[0] ?? '')))
  add(/<wps:wsp\b[\s\S]*?<\/wps:wsp>/g, (s) => {
    const sp = s.match(/<wps:spPr>[\s\S]*?<\/wps:spPr>/)?.[0] ?? ''
    return (
      isDarkHex(sp.match(/<a:solidFill>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"/)?.[1]) ||
      /<a:solidFill>\s*<a:schemeClr val="(tx1|dk1|dk2|accent\d)"/.test(sp)
    )
  })
  add(/<v:(shape|rect|roundrect)\b[\s\S]*?<\/v:\1>/g, (s) => isDarkHex(s.match(/^<v:[a-z]+\b[^>]*\bfillcolor="#?([0-9A-Fa-f]{6})"/)?.[1]))
  return out
}

function runIsHidden(run: string, onDark: boolean): boolean {
  const pr = run.match(/<w:rPr>([\s\S]*?)<\/w:rPr>/)?.[1] ?? ''
  if (/<w:vanish(\s*\/>|\s+w:val="(true|1|on)"\s*\/>)/.test(pr)) return true
  const color = pr.match(/<w:color\s+w:val="([0-9A-Fa-f]{6})"/)?.[1]
  const dark = onDark || isDarkHex(shdFill(pr)) || DARK_HIGHLIGHT.test(pr)
  if (color && nearWhite(color) && !dark) return true
  const size = pr.match(/<w:sz\s+w:val="(\d+)"/)?.[1]
  return size != null && Number(size) < 8 // half-points: under 4 pt
}

// Removes runs a reader can't see (hidden, white on a light background, under 4 pt) and returns their text.
export async function stripHiddenDocx(bytes: Buffer): Promise<{ bytes: Buffer; hidden: string }> {
  const zip = await JSZip.loadAsync(bytes)
  const doc = zip.file('word/document.xml')
  if (!doc) return { bytes, hidden: '' }
  const xml = await doc.async('string')
  const hidden: string[] = []
  const dark = darkRanges(xml)
  const cleaned = xml.replace(/<w:r\b[^>]*>[\s\S]*?<\/w:r>/g, (run: string, at: number) => {
    if (!runIsHidden(run, dark.some(([a, b]) => at >= a && at < b))) return run
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
  transform: 12,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  setTextRenderingMode: 38,
  showText: 44,
  showSpacedText: 45,
  nextLineShowText: 46,
  nextLineSetSpacingShowText: 47,
  setFillGray: 57,
  setFillRGBColor: 59,
  constructPath: 91
}
const FILLS = [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke]

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

const isDark = (args: unknown[]): boolean => {
  const [a, b, c] = args
  if (typeof a === 'string') return isDarkHex(a)
  if (typeof a === 'number' && args.length === 1) return a / (a > 1 ? 255 : 1) < 0.5
  if ([a, b, c].every((x) => typeof x === 'number')) {
    const max = Math.max(a as number, b as number, c as number) > 1 ? 255 : 1
    const [r, g, bl] = [a, b, c].map((x) => (x as number) / max)
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl < 0.5
  }
  return false
}

type Matrix = [number, number, number, number, number, number]
const multiply = (m: Matrix, n: number[]): Matrix => [
  n[0] * m[0] + n[1] * m[2],
  n[0] * m[1] + n[1] * m[3],
  n[2] * m[0] + n[3] * m[2],
  n[2] * m[1] + n[3] * m[3],
  n[4] * m[0] + n[5] * m[2] + m[4],
  n[4] * m[1] + n[5] * m[3] + m[5]
]
// A path's bounding box (user space) mapped to page space.
const pageRect = (m: Matrix, [x0, y0, x1, y1]: number[]): number[] => {
  const pts = [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1]
  ].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]])
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

const glyphText = (args: unknown[]): string => {
  const glyphs = Array.isArray(args[0]) ? (args[0] as unknown[]) : []
  return glyphs
    .map((g) =>
      g && typeof g === 'object' && 'unicode' in g ? String((g as { unicode: string }).unicode) : typeof g === 'number' && g < -200 ? ' ' : ''
    )
    .join('')
}

// Text under 4 pt, outside the page, in white on a light background, or drawn with invisible render mode.
// White text placed on a dark filled shape (a template's sidebar) is visible and isn't reported.
export async function pdfHiddenText(doc: PdfDoc, maxPages: number): Promise<{ tiny: string[]; white: string[] }> {
  const tiny: string[] = []
  const white: string[] = []
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n)
    const [x0, y0, x1, y1] = page.view
    const items: TextItem[] = []
    for (const item of (await page.getTextContent()).items) {
      if (!('str' in item) || !item.str.trim()) continue
      items.push(item)
      const [a, b, , , e, f] = item.transform
      const size = Math.hypot(a, b)
      const offPage = e < x0 - 5 || e > x1 + 5 || f < y0 - 5 || f > y1 + 5
      if (size < 4 || offPage) tiny.push(item.str)
    }
    const ops = await page.getOperatorList()
    let fillWhite = false
    let fillDark = false
    let invisible = false
    let ctm: Matrix = [1, 0, 0, 1, 0, 0]
    let lastPath: number[] | null = null
    const stack: [boolean, boolean, boolean, Matrix][] = []
    const darkRects: number[][] = []
    const whiteHere: { text: string; invisible: boolean }[] = []
    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i]
      const args = ops.argsArray[i] ?? []
      if (fn === OPS.save) stack.push([fillWhite, fillDark, invisible, ctm])
      else if (fn === OPS.restore) [fillWhite, fillDark, invisible, ctm] = stack.pop() ?? [false, false, false, [1, 0, 0, 1, 0, 0]]
      else if (fn === OPS.transform && args.length === 6) ctm = multiply(ctm, args as number[])
      else if (fn === OPS.constructPath) {
        // pdf.js 5 puts the paint operator and the bounding box on the path itself.
        const box = args[2] && (Array.isArray(args[2]) || ArrayBuffer.isView(args[2])) ? Array.from(args[2] as ArrayLike<number>) : null
        lastPath = box && box.length === 4 ? pageRect(ctm, box) : null
        if (lastPath && fillDark && FILLS.includes(args[0] as number)) darkRects.push(lastPath)
      } else if (FILLS.includes(fn) && lastPath && fillDark) darkRects.push(lastPath)
      else if (fn === OPS.setFillRGBColor || fn === OPS.setFillGray) {
        fillWhite = isWhite(args)
        fillDark = isDark(args)
      } else if (fn === OPS.setTextRenderingMode) invisible = args[0] === 3 || args[0] === 7
      else if (
        (fillWhite || invisible) &&
        (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText)
      ) {
        const t = glyphText(fn === OPS.nextLineSetSpacingShowText ? args.slice(2) : args)
        if (t.trim()) whiteHere.push({ text: t, invisible })
      }
    }
    // White text counts as visible only when every text item it matches sits on a dark shape.
    const squash = (x: string): string => x.replace(/\s+/g, '')
    const onDarkShape = (x: number, y: number): boolean =>
      darkRects.some(([a, b, c, d]) => x >= a - 1 && x <= c + 1 && y >= b - 1 && y <= d + 1)
    for (const w of whiteHere) {
      const matched = w.invisible ? [] : items.filter((it) => squash(it.str) && squash(w.text).includes(squash(it.str)))
      if (!(matched.length > 0 && matched.every((it) => onDarkShape(it.transform[4], it.transform[5])))) white.push(w.text)
    }
  }
  return { tiny, white }
}

export const joinFragments = (xs: string[]): string => xs.join(' ').replace(/\s+/g, ' ').trim()

// A warning on its own: the pipeline raises it to high when the hidden text gives instructions or
// copies the job description (council review: honest templates shouldn't be penalised).
export function hiddenTextFlag(hidden: string, how: string): ReviewFlag[] {
  if (hidden.replace(/\s/g, '').length < 15) return []
  return [
    {
      code: 'hidden_text',
      severity: 'warn',
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
