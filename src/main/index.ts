import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createDb } from './store/db'
import { Ctx, registerIpc, settingsHandlers } from './ipc'
import { createServices, jobHandlers } from './jobs'
import { createInbox, inboxHandlers } from './inbox/handlers'
import { isUnlocked, lockHandlers } from './lock/handlers'

let mainWindow: BrowserWindow | null = null

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
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })
  mainWindow.on('closed', () => (mainWindow = null))

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
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

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  const dataDir = join(app.getPath('userData'), 'data')
  const ctx: Ctx = { db: createDb(dataDir), dataDir, win: () => mainWindow }
  const services = createServices(ctx)
  const inbox = createInbox(ctx, services.cached)
  registerIpc(
    {
      ...lockHandlers(),
      ...settingsHandlers(),
      ...jobHandlers(ctx, services),
      ...inboxHandlers(ctx, inbox, services.pipeline)
    },
    isUnlocked
  )

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
