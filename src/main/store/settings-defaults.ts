import type { AppSettings } from '../../shared/types'

export const DEFAULT_SETTINGS: AppSettings = {
  model: 'gemini-flash-lite-latest',
  policyText: '',
  requiredDocs: ['CV', 'Cover letter', 'Diploma'],
  doubleCheck: false,
  concurrency: 2
}
