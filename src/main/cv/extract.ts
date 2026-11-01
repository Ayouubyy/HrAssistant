import { readFile } from 'fs/promises'
import { extname } from 'path'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import type { ReviewFlag } from '../../shared/types'
import { sha256 } from '../ai/cache'
import { checkSize, checkZipBomb, LIMITS, scanDocx, scanPdfBytes, TooLargeError, zipEntries } from '../security/active-content'
import { hiddenTextFlag, joinFragments, pdfHiddenText, removeFragments, stripHiddenDocx, type PdfDoc } from '../security/hidden-text'

export class UnreadableFileError extends Error {
  constructor() {
    super("Couldn't read text from this file")
  }
}

export class UnsupportedFileError extends Error {
  constructor(ext: string) {
    super(
      ['.docm', '.dotm', '.doc', '.dot'].includes(ext)
        ? `${ext} files aren't accepted (they can carry macros). Save it as .docx or PDF.`
        : `Unsupported file type ${ext || '(none)'}. Use PDF or DOCX.`
    )
  }
}

export const SUPPORTED = ['.pdf', '.docx']

export interface Extracted {
  // what a person sees: hidden text removed
  text: string
  // everything in the file, for the injection scanner
  fullText: string
  hash: string
  flags: ReviewFlag[]
}

async function pdf(data: Buffer): Promise<Omit<Extracted, 'hash'>> {
  const parser = new PDFParse({ data: new Uint8Array(data) })
  try {
    const fullText = (await parser.getText({ first: LIMITS.pdfPages })).text
    const flags = scanPdfBytes(data)
    let text = fullText
    try {
      // pdf-parse keeps the pdf.js document private; its loader is the only way to reach page operators.
      const doc = await (parser as unknown as { load(): Promise<PdfDoc> }).load()
      const hidden = await pdfHiddenText(doc, LIMITS.pdfPages)
      text = removeFragments(text, [...hidden.tiny, ...hidden.white])
      flags.push(...hiddenTextFlag(joinFragments(hidden.tiny), 'tiny or off-page'))
      flags.push(...hiddenTextFlag(joinFragments(hidden.white), 'white or invisible'))
    } catch {
      // hidden-text detection is best effort; the visible text is still scored
    }
    return { text, fullText, flags }
  } finally {
    await parser.destroy()
  }
}

async function docx(data: Buffer): Promise<Omit<Extracted, 'hash'>> {
  const entries = zipEntries(data)
  checkZipBomb(entries)
  const flags = await scanDocx(data, entries)
  const fullText = (await mammoth.extractRawText({ buffer: data })).value
  const stripped = await stripHiddenDocx(data)
  const text = stripped.hidden ? (await mammoth.extractRawText({ buffer: stripped.bytes })).value : fullText
  flags.push(...hiddenTextFlag(stripped.hidden, 'hidden, white or tiny'))
  return { text, fullText, flags }
}

const tidy = (t: string): string => t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()

export async function extractText(filePath: string): Promise<Extracted> {
  const ext = extname(filePath).toLowerCase()
  if (!SUPPORTED.includes(ext)) throw new UnsupportedFileError(ext)
  const data = await readFile(filePath)
  checkSize(data.length, LIMITS.cvBytes, 'CV')
  let r: Omit<Extracted, 'hash'>
  try {
    r = ext === '.pdf' ? await pdf(data) : await docx(data)
  } catch (e) {
    if (e instanceof TooLargeError) throw e
    throw new UnreadableFileError()
  }
  const text = tidy(r.text)
  if (text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim().length < 200) throw new UnreadableFileError()
  return { text, fullText: tidy(r.fullText), hash: sha256(data), flags: r.flags }
}
