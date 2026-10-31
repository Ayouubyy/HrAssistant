import { readFile } from 'fs/promises'
import { extname } from 'path'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'
import { sha256 } from '../ai/cache'

export class UnreadableFileError extends Error {
  constructor() {
    super("Couldn't read text from this file")
  }
}

export class UnsupportedFileError extends Error {
  constructor(ext: string) {
    super(`Unsupported file type ${ext || '(none)'}. Use PDF or DOCX.`)
  }
}

export const SUPPORTED = ['.pdf', '.docx']

async function pdfText(data: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(data) })
  try {
    return (await parser.getText()).text
  } finally {
    await parser.destroy()
  }
}

export async function extractText(filePath: string): Promise<{ text: string; hash: string }> {
  const ext = extname(filePath).toLowerCase()
  if (!SUPPORTED.includes(ext)) throw new UnsupportedFileError(ext)
  const data = await readFile(filePath)
  let text: string
  try {
    text = ext === '.pdf' ? await pdfText(data) : (await mammoth.extractRawText({ buffer: data })).value
  } catch {
    throw new UnreadableFileError()
  }
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  if (text.replace(/--\s*\d+\s*of\s*\d+\s*--/g, '').trim().length < 200) throw new UnreadableFileError()
  return { text, hash: sha256(data) }
}
