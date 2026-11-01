import { app, dialog, shell, BrowserWindow, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createDb } from './store/db'
import { Ctx, push, registerIpc, settingsHandlers } from './ipc'
import { createServices, jobHandlers } from './jobs'
import { applyRetention } from './store/retention'
import { createInbox, inboxHandlers } from './inbox/handlers'
import { isUnlocked, lockHandlers, startAutoLock } from './lock/handlers'
import { getSettings } from './store/settings'

let mainWindow: BrowserWindow | null = null

// Only plain https links leave the app, and only after HR sees the full address (T-29).
async function openExternalSafely(url: string): Promise<void> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return
  }
  if (parsed.protocol !== 'https:' || !mainWindow) return
  const r = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Open in browser', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Open link',
    message: 'Open this link in your browser?',
    detail: parsed.href
  })
  if (r.response === 0) void shell.openExternal(parsed.href)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    title: 'HR Assistant',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: is.dev
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })
  mainWindow.on('closed', () => (mainWindow = null))

  // A file dropped anywhere outside a drop zone must not replace the app with a file viewer.
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(process.env['ELECTRON_RENDERER_URL'] ?? '\u0000')) e.preventDefault()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void openExternalSafely(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.hrassistant.app')

  // No camera, microphone, location, notifications or anything else.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, cb) => cb(false))
  session.defaultSession.setPermissionCheckHandler(() => false)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const dataDir = join(app.getPath('userData'), 'data')
  const ctx: Ctx = { db: createDb(dataDir), dataDir, win: () => mainWindow }
  applyRetention(ctx.db, dataDir, getSettings().retentionDays)
  const services = createServices(ctx)
  const inbox = createInbox(ctx, services.cached)
  registerIpc(
    {
      ...lockHandlers(),
      ...settingsHandlers((before, after) => {
        if (before.companyDomains.join() !== after.companyDomains.join()) inbox.refreshFlags()
      }),
      ...jobHandlers(ctx, services),
      ...inboxHandlers(ctx, inbox, services.pipeline)
    },
    isUnlocked
  )
  startAutoLock(() => push(ctx, 'lock:locked', null))

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// No other window or webview may be created by the renderer.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
