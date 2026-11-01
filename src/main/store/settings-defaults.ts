import type { AppSettings } from '../../shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'gemini-flash-lite-latest',
  policyText: '',
  requiredDocs: ['CV', 'Cover letter', 'Diploma'],
  doubleCheck: false,
  concurrency: 2,
  companyDomains: [],
  autoLockMinutes: 10,
  retentionDays: 0
}
