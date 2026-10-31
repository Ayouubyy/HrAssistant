import { contextBridge, ipcRenderer, webUtils } from 'electron'

const api = {
  invoke: (channel: string, ...args: unknown[]): Promise<unknown> => ipcRenderer.invoke(channel, ...args),
  on: (event: string, cb: (payload: unknown) => void): (() => void) => {
    const listener = (_e: unknown, payload: unknown): void => cb(payload)
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  },
  pathForFile: (file: File): string => webUtils.getPathForFile(file)
}

export type Bridge = typeof api

contextBridge.exposeInMainWorld('api', api)
