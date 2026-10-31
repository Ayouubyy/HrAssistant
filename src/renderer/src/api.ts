import type { AppSettings, Candidate, EmailItem, JobFilter, PresetId, Requirement } from '@shared/types'

const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  window.api.invoke(channel, ...args) as Promise<T>

export const api = {
  lock: {
    status: () => call<{ hasPin: boolean; unlocked: boolean }>('lock:status'),
    helloAvailable: () => call<boolean>('lock:helloAvailable'),
    setPin: (pin: string) => call<void>('lock:setPin', pin),
    unlock: (pin: string) => call<boolean>('lock:unlock', pin),
    hello: () => call<boolean>('lock:hello'),
    lock: () => call<void>('lock:lock')
  },
  settings: {
    get: () => call<AppSettings>('settings:get'),
    save: (patch: Partial<AppSettings>) => call<AppSettings>('settings:save', patch),
    setGeminiKey: (key: string) => call<void>('secrets:setGeminiKey', key),
    hasGeminiKey: () => call<boolean>('secrets:hasGeminiKey')
  },
  jobs: {
    list: () => call<JobFilter[]>('jobs:list'),
    get: (id: string) => call<JobFilter | null>('jobs:get', id),
    save: (job: JobFilter) => call<JobFilter>('jobs:save', job),
    remove: (id: string) => call<void>('jobs:delete', id),
    extractRequirements: (description: string, preset: PresetId) =>
      call<{ title: string; requirements: Requirement[] }>('jobs:extractRequirements', description, preset),
    loadDescriptionFile: () => call<string | null>('jobs:loadDescriptionFile')
  },
  candidates: {
    list: (jobId: string) => call<Candidate[]>('candidates:list', jobId),
    counts: () => call<Record<string, number>>('candidates:counts'),
    pickFiles: () => call<string[]>('candidates:pickFiles'),
    add: (jobId: string, paths: string[]) => call<Candidate[]>('candidates:add', jobId, paths),
    update: (id: string, patch: Partial<Candidate>) => call<Candidate>('candidates:update', id, patch),
    retry: (id: string) => call<void>('candidates:retry', id),
    open: (id: string) => call<void>('candidates:open', id),
    exportCsv: (jobId: string) => call<boolean>('candidates:exportCsv', jobId)
  },
  inbox: {
    list: () => call<EmailItem[]>('inbox:list'),
    loadDemo: () => call<number>('inbox:loadDemo'),
    triageAll: () => call<void>('inbox:triageAll'),
    retriage: (id: string) => call<void>('inbox:retriage', id),
    clear: () => call<void>('inbox:clear'),
    openAttachment: (path: string) => call<void>('inbox:openAttachment', path),
    sendToScreening: (emailId: string, jobId: string) => call<number>('inbox:sendToScreening', emailId, jobId)
  },
  gmail: {
    status: () => call<{ connected: boolean; user: string | null }>('gmail:status'),
    connect: (user: string, appPassword: string) => call<void>('gmail:connect', user, appPassword),
    disconnect: () => call<void>('gmail:disconnect'),
    refresh: () => call<number>('gmail:refresh'),
    send: (emailId: string, body: string) => call<void>('gmail:send', emailId, body)
  },
  assistant: {
    ask: (
      ref: { kind: 'job'; jobId: string } | { kind: 'email'; emailId: string } | { kind: 'none' },
      history: { role: 'user' | 'assistant'; content: string }[]
    ) =>
      call<{ answer: string; filter?: { label: string; ids?: string[] } }>('assistant:ask', ref, history)
  },
  on: window.api.on,
  pathForFile: window.api.pathForFile
}

export function errorMessage(e: unknown): string {
  const m = String((e as Error)?.message ?? e)
  return m.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}
