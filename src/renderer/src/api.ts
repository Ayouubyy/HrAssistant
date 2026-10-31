import type { AppSettings } from '@shared/types'

const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  window.api.invoke(channel, ...args) as Promise<T>

export const api = {
  settings: {
    get: () => call<AppSettings>('settings:get'),
    save: (patch: Partial<AppSettings>) => call<AppSettings>('settings:save', patch),
    setGeminiKey: (key: string) => call<void>('secrets:setGeminiKey', key),
    hasGeminiKey: () => call<boolean>('secrets:hasGeminiKey')
  },
  on: window.api.on,
  pathForFile: window.api.pathForFile
}
