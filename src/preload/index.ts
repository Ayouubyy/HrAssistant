import { contextBridge, ipcRenderer, webUtils } from 'electron'

// Only these channels and events reach the main process (T-30). Add new ones here and in CLAUDE.md §6.
const CHANNELS = new Set([
  'lock:status',
  'lock:helloAvailable',
  'lock:setPin',
  'lock:unlock',
  'lock:hello',
  'lock:lock',
  'settings:get',
  'settings:save',
  'secrets:setGeminiKey',
  'secrets:hasGeminiKey',
  'jobs:list',
  'jobs:get',
  'jobs:save',
  'jobs:delete',
  'jobs:rescreen',
  'jobs:extractRequirements',
  'jobs:loadDescriptionFile',
  'candidates:list',
  'candidates:counts',
  'candidates:pickFiles',
  'candidates:add',
  'candidates:update',
  'candidates:delete',
  'candidates:retry',
  'candidates:open',
  'candidates:exportCsv',
  'assistant:ask',
  'inbox:list',
  'inbox:loadDemo',
  'inbox:triageAll',
  'inbox:retriage',
  'inbox:clear',
  'inbox:dismissFlags',
  'inbox:openAttachment',
  'inbox:sendToScreening',
  'gmail:status',
  'gmail:connect',
  'gmail:disconnect',
  'gmail:refresh',
  'gmail:recipient',
  'gmail:send'
])
const EVENTS = new Set(['candidates:updated', 'candidates:removed', 'jobs:changed', 'emails:updated', 'emails:changed', 'lock:locked'])

const api = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
    if (!CHANNELS.has(channel)) return Promise.reject(new Error(`Unknown channel ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  },
  on: (event: string, cb: (payload: unknown) => void): (() => void) => {
    if (!EVENTS.has(event)) throw new Error(`Unknown event ${event}`)
    const listener = (_e: unknown, payload: unknown): void => cb(payload)
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  },
  pathForFile: (file: File): string => webUtils.getPathForFile(file)
}

export type Bridge = typeof api

contextBridge.exposeInMainWorld('api', api)
