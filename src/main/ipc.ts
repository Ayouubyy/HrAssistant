import { BrowserWindow, ipcMain } from 'electron'
import type { AppSettings } from '../shared/types'
import type { Db } from './store/db'
import { getGeminiKey, setSecret } from './store/secrets'
import { getSettings, saveSettings } from './store/settings'
import { assertString, validateSettingsPatch } from './security/validate'

export interface Ctx {
  db: Db
  dataDir: string
  win: () => BrowserWindow | null
}

type Handler = (...args: never[]) => unknown

export function registerIpc(handlers: Record<string, Handler>, isUnlocked: () => boolean): void {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (_e, ...args) => {
      if (!channel.startsWith('lock:') && !isUnlocked()) throw new Error('HR Assistant is locked.')
      return (fn as (...a: unknown[]) => unknown)(...args)
    })
  }
}

export function push(ctx: Ctx, event: string, payload: unknown): void {
  ctx.win()?.webContents.send(event, payload)
}

// The renderer only ever learns whether a secret exists, never its value.
export function settingsHandlers(onChange: (before: AppSettings, after: AppSettings) => void = () => {}): Record<string, Handler> {
  return {
    'settings:get': () => getSettings(),
    'settings:save': (patch: unknown) => {
      const before = getSettings()
      const after = saveSettings(validateSettingsPatch(patch))
      onChange(before, after)
      return after
    },
    'secrets:setGeminiKey': (key: unknown) => {
      assertString(key, 200, 'API key')
      setSecret('geminiKey', key.trim() || null)
    },
    'secrets:hasGeminiKey': () => !!getGeminiKey()
  }
}
