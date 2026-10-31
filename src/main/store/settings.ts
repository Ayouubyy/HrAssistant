import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '../../shared/types'
import { writeJsonAtomic } from './db'

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'gemini-flash-lite-latest',
  policyText: '',
  requiredDocs: ['CV', 'Cover letter', 'Diploma'],
  doubleCheck: false,
  concurrency: 3
}

const file = (): string => join(app.getPath('userData'), 'settings.json')

export function getSettings(): AppSettings {
  const saved = existsSync(file()) ? JSON.parse(readFileSync(file(), 'utf8')) : {}
  return { ...DEFAULT_SETTINGS, ...saved }
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch }
  writeJsonAtomic(file(), next)
  return next
}
