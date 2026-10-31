import { app, safeStorage } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { writeJsonAtomic } from './db'

export type SecretName = 'geminiKey' | 'gmailUser' | 'gmailAppPassword' | 'pinHash' | 'helloCredential'

const file = (): string => join(app.getPath('userData'), 'secrets.json')

const readAll = (): Record<string, string> =>
  existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {}

export function getSecret(name: SecretName): string | null {
  const enc = readAll()[name]
  if (!enc) return null
  return safeStorage.decryptString(Buffer.from(enc, 'base64'))
}

export function setSecret(name: SecretName, value: string | null): void {
  const all = readAll()
  if (value === null) delete all[name]
  else all[name] = safeStorage.encryptString(value).toString('base64')
  writeJsonAtomic(file(), all)
}

let envLoaded = false
function loadEnvLocal(): void {
  if (envLoaded) return
  envLoaded = true
  const f = join(app.getAppPath(), '.env.local')
  if (!existsSync(f)) return
  for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
}

export function getGeminiKey(): string | null {
  const saved = getSecret('geminiKey')
  if (saved) return saved
  loadEnvLocal()
  return process.env.GEMINI_API_KEY || null
}
