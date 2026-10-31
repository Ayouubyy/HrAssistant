import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings } from '../../shared/types'
import { writeJsonAtomic } from './db'
import { DEFAULT_SETTINGS } from './settings-defaults'

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
