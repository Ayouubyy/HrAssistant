import type { AppSettings, Candidate, JobFilter, PresetId, Requirement } from '@shared/types'

const call = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  window.api.invoke(channel, ...args) as Promise<T>

export const api = {
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
  on: window.api.on,
  pathForFile: window.api.pathForFile
}

export function errorMessage(e: unknown): string {
  const m = String((e as Error)?.message ?? e)
  return m.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
}
