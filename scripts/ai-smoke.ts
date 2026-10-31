import { readFileSync } from 'fs'
import { GeminiProvider } from '../src/main/ai/gemini'

const key = readFileSync('.env.local', 'utf8').match(/GEMINI_API_KEY=(.*)/)![1].trim()
const ai = new GeminiProvider(key, process.argv[2] ?? 'gemini-flash-latest')
const t = Date.now()
ai.json<{ city: string; arabic: string }>({
  system: 'Answer briefly.',
  prompt: 'Capital of Morocco, and its name in Arabic.',
  schema: { type: 'object', properties: { city: { type: 'string' }, arabic: { type: 'string' } }, required: ['city', 'arabic'] }
}).then((r) => console.log(r, Date.now() - t, 'ms'))
