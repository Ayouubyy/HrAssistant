import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { loadEmlFolder, parseEmail } from '../src/main/inbox/eml'
import { normalizeTriage, triageEmail } from '../src/main/inbox/triage'
import { InvalidModelOutputError, type AIProvider } from '../src/main/ai/provider'
import { DEFAULT_SETTINGS } from '../src/main/store/settings-defaults'

const inbox = join(__dirname, '..', 'test-data', 'inbox')
const tmp = (): string => mkdtempSync(join(tmpdir(), 'hri-'))

describe('parseEmail', () => {
  it('reads an application with a CV and other attachments', async () => {
    const e = await parseEmail(readFileSync(join(inbox, '01.eml')), 'eml', tmp())
    expect(e.subject).toBe('Application – Credit Analyst position')
    expect(e.from).toContain('Amina Haddad')
    expect(e.attachments).toHaveLength(3)
    expect(e.attachments.filter((a) => a.isCv).map((a) => a.fileName)).toEqual(['en-02-amina-haddad.pdf'])
    expect(readFileSync(e.attachments[0].path).length).toBeGreaterThan(1000)
  })
  it('detects a CV attachment with an Arabic email', async () => {
    const e = await parseEmail(readFileSync(join(inbox, '09.eml')), 'eml', tmp())
    expect(e.attachments.find((a) => a.isCv)?.fileName).toBe('ar-01-khalid-amrani.docx')
  })
  it('counts the messages in a quoted thread', async () => {
    const e = await parseEmail(readFileSync(join(inbox, '06.eml')), 'eml', tmp())
    expect(e.threadCount).toBe(4)
  })
  it('gives the same email the same id', async () => {
    const raw = readFileSync(join(inbox, '03.eml'))
    expect((await parseEmail(raw, 'eml', tmp())).id).toBe((await parseEmail(raw, 'eml', tmp())).id)
  })
})

describe('loadEmlFolder', () => {
  it('loads every .eml file', async () => {
    expect(await loadEmlFolder(inbox, tmp())).toHaveLength(10)
  })
})

describe('normalizeTriage', () => {
  it('refuses malformed output instead of inventing a triage', () => {
    expect(() => normalizeTriage({})).toThrow(InvalidModelOutputError)
    expect(() => normalizeTriage({ category: 'spam', urgent: 'yes', summary: 3, missingDocuments: 'x' })).toThrow(
      InvalidModelOutputError
    )
  })
  it('fills cosmetic fields of a valid triage', () => {
    expect(normalizeTriage({ category: 'leave', urgent: false, summary: 'Leave request', missingDocuments: 'x' })).toEqual({
      category: 'leave',
      urgent: false,
      urgencyReason: '',
      summary: 'Leave request',
      suspiciousInstructions: [],
      draftReply: null,
      missingDocuments: []
    })
  })
})

describe('triageEmail', () => {
  it('sends the policy and required documents to the model', async () => {
    const seen: string[] = []
    const ai: AIProvider = {
      model: 'fake',
      json: async <T,>({ system, prompt }: { system: string; prompt: string }) => {
        seen.push(system + prompt)
        return { category: 'application', urgent: false, urgencyReason: '', summary: 's', draftReply: 'd', missingDocuments: ['Diploma'] } as T
      },
      text: async () => ''
    }
    const e = await parseEmail(readFileSync(join(inbox, '02.eml')), 'eml', tmp())
    const t = await triageEmail(ai, e, { ...DEFAULT_SETTINGS, policyText: 'Leave: 22 days' })
    expect(seen[0]).toContain('Leave: 22 days')
    expect(seen[0]).toContain('Diploma')
    expect(seen[0]).toContain('fr-04-omar-tazi.docx')
    expect(t.missingDocuments).toEqual(['Diploma'])
  })
})
