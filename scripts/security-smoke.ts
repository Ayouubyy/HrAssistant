// Runs the real pipeline (real Gemini, synthetic data only) on the clean test CVs and the attack CVs,
// and prints each score with its security flags. Clean CVs should raise no high flag.
// Run: npx tsx scripts/security-smoke.ts [model]
import { mkdtempSync, readdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { createCache } from '../src/main/ai/cache'
import { GeminiProvider } from '../src/main/ai/gemini'
import { withRetry } from '../src/main/ai/provider'
import { extractRequirements } from '../src/main/cv/prompts'
import { createPipeline } from '../src/main/cv/pipeline'
import { createDb } from '../src/main/store/db'
import { weightedScore } from '../src/shared/scoring'
import type { Candidate, JobFilter } from '../src/shared/types'

const key = readFileSync('.env.local', 'utf8').match(/GEMINI_API_KEY=(.*)/)![1].trim()
const ai = new GeminiProvider(key, process.argv[2] ?? 'gemini-flash-lite-latest')
const desc = readFileSync('test-data/jobs/credit-analyst-fr.txt', 'utf8')

async function main(): Promise<void> {
  const { title, requirements } = await withRetry(() => extractRequirements(ai, desc, 'banking'))
  const job: JobFilter = {
    id: 'j',
    title,
    description: desc,
    preset: 'banking',
    requirements,
    weights: { skills: 4, experience: 3, education: 2, languages: 1 },
    threshold: 60,
    autoRejectMissingMustHave: true,
    autoRejectBelowThreshold: true,
    createdAt: ''
  }
  const dir = mkdtempSync(join(tmpdir(), 'hr-smoke-'))
  const db = createDb(join(dir, 'db'))
  db.put('jobs', job)
  const pipeline = createPipeline({
    ai: () => ai,
    db,
    cached: createCache(join(dir, 'cache')),
    filesDir: join(dir, 'files'),
    concurrency: () => 2,
    doubleCheck: () => false,
    onUpdate: () => {}
  })
  const files = [
    ...readdirSync('test-data/cvs').map((f) => resolve('test-data/cvs', f)),
    ...readdirSync('test-data/attacks')
      .filter((f) => f.startsWith('cv-') && !f.startsWith('cv-bias'))
      .map((f) => resolve('test-data/attacks', f))
  ]
  const t = Date.now()
  await pipeline.addFiles('j', files, 'upload')
  await pipeline.idle()
  let falseAlarms = 0
  for (const c of db.list<Candidate>('candidates')) {
    const clean = !c.fileName.startsWith('cv-') || c.fileName.startsWith('cv-clean')
    const high = (c.flags ?? []).filter((f) => f.severity === 'high')
    if (clean && high.length) falseAlarms++
    const score = c.analysis ? weightedScore(c.analysis.subScores, job.weights) : '—'
    console.log(
      `${clean ? 'clean ' : 'attack'} ${String(score).padStart(3)} ${c.fileName.padEnd(32)} ${c.status === 'error' ? `ERROR ${c.error}` : ''}`,
      (c.flags ?? []).map((f) => `[${f.severity}] ${f.code}`).join(' ')
    )
  }
  console.log(`${files.length} CVs in ${Date.now() - t} ms · clean CVs with a high flag: ${falseAlarms}`)
}
main()
