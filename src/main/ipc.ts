import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { fileURLToPath } from 'url'
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

// Our own page: the dev server's exact origin in development, the bundled index.html otherwise.
export function isAppUrl(url: string): boolean {
  try {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (dev && !app.isPackaged) return new URL(url).origin === new URL(dev).origin
    const u = new URL(url)
    return u.protocol === 'file:' && fileURLToPath(u).toLowerCase() === join(__dirname, '../renderer/index.html').toLowerCase()
  } catch {
    return false
  }
}

// Only the top frame of our own page may call the main process (not an iframe or another page).
const trusted = (e: IpcMainInvokeEvent): boolean =>
  !!e.senderFrame && !e.senderFrame.parent && !!BrowserWindow.fromWebContents(e.sender) && isAppUrl(e.senderFrame.url)

export function registerIpc(handlers: Record<string, Handler>, isUnlocked: () => boolean): void {
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, (e, ...args) => {
      if (!trusted(e)) throw new Error('Request refused.')
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
    'secrets:setGeminiKey': async (key: unknown) => {
      assertString(key, 200, 'API key')
      setSecret('geminiKey', key.trim() || null)
      // Shown once, in the main process, so it can't be skipped by the page (council review).
      if (key.trim() && !getSettings().freeTierAcknowledged) {
        await dialog.showMessageBox({
          type: 'warning',
          buttons: ['I understand'],
          title: 'Gemini API key',
          message: 'On Google’s free tier, what you send may be used to improve Google’s products.',
          detail: 'That includes CV and email text, and people at Google may review it. Use demo data only, or a key from a billing-enabled Google Cloud project.'
        })
        saveSettings({ freeTierAcknowledged: true })
      }
    },
    'secrets:hasGeminiKey': () => !!getGeminiKey()
  }
}
