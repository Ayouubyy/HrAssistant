import { writeFileSync, mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { extractText, UnreadableFileError, UnsupportedFileError } from '../src/main/cv/extract'

const data = (p: string): string => join(__dirname, '..', 'test-data', p)

describe('extractText', () => {
  it('reads an English DOCX', async () => {
    const { text } = await extractText(data('cvs/en-01-james-carter.docx'))
    expect(text).toContain('Credit Risk Analyst')
  })
  it('reads an Arabic DOCX', async () => {
    const { text } = await extractText(data('cvs/ar-01-khalid-amrani.docx'))
    expect(text).toContain('محلل ائتمان')
  })
  it('reads a PDF', async () => {
    const { text } = await extractText(data('cvs/fr-01-yasmine-alaoui.pdf'))
    expect(text).toContain('Attijariwafa')
  })
  it('reads an Arabic PDF', async () => {
    const { text } = await extractText(data('cvs/ar-04-nadia-elfassi.pdf'))
    expect(text).toContain('IFRS 9')
    expect(text.length).toBeGreaterThan(200)
  })
  it('rejects a PDF with no text', async () => {
    await expect(extractText(data('blank.pdf'))).rejects.toBeInstanceOf(UnreadableFileError)
  })
  it('rejects unsupported file types', async () => {
    const f = join(mkdtempSync(join(tmpdir(), 'hrx-')), 'cv.txt')
    writeFileSync(f, 'hello')
    await expect(extractText(f)).rejects.toBeInstanceOf(UnsupportedFileError)
  })
  it('hashes the same file the same way', async () => {
    const a = await extractText(data('cvs/en-01-james-carter.docx'))
    const b = await extractText(data('cvs/en-01-james-carter.docx'))
    expect(a.hash).toBe(b.hash)
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
