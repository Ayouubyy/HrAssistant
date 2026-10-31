import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { GeminiProvider } from '../src/main/ai/gemini'
import { analyzeCv, extractRequirements } from '../src/main/cv/prompts'
import { extractText } from '../src/main/cv/extract'
import { evaluateCandidate } from '../src/shared/scoring'
import type { JobFilter } from '../src/shared/types'

const key = readFileSync('.env.local', 'utf8').match(/GEMINI_API_KEY=(.*)/)![1].trim()
const ai = new GeminiProvider(key, process.argv[2] ?? 'gemini-flash-lite-latest')
const desc = readFileSync('test-data/jobs/credit-analyst-fr.txt', 'utf8')

async function main(): Promise<void> {
  let t = Date.now()
  const { title, requirements } = await extractRequirements(ai, desc, 'banking')
  console.log(title, `(${Date.now() - t} ms)`)
  requirements.forEach((r) => console.log(' ', r.mustHave ? 'MUST' : 'nice', r.text))
  const job: JobFilter = { id: 'j', title, description: desc, preset: 'banking', requirements, weights: { skills: 4, experience: 3, education: 2, languages: 1 }, threshold: 60, autoRejectMissingMustHave: true, autoRejectBelowThreshold: true, createdAt: '' }
  const dir = 'test-data/cvs'
  t = Date.now()
  const rows = await Promise.all(readdirSync(dir).map(async (f) => {
    const { text } = await extractText(join(dir, f))
    const a = await analyzeCv(ai, job, text)
    const e = evaluateCandidate({ id: f, jobId: 'j', fileName: f, filePath: '', fileHash: '', source: 'upload', status: 'done', analysis: a, hrDecision: null, restored: false, revealed: false }, job)
    return { f, name: a.identity.name, ...e, verdict: a.verdict, miss: a.requirements.filter((r) => r.status !== 'met').map((r) => r.status + ':' + requirements.find((q) => q.id === r.requirementId)?.text).join('; ') }
  }))
  rows.sort((a, b) => b.score - a.score).forEach((r) => console.log(String(r.score).padStart(3), r.rejected ? 'REJ' : 'ok ', r.f.padEnd(32), '|', r.reason ?? r.verdict, '|', r.miss))
  console.log(`${rows.length} CVs in ${Date.now() - t} ms`)
}
main()
