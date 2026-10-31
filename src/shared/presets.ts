import type { PresetId } from './types'

export const PRESETS: Record<PresetId, { label: string; guidance: string }> = {
  generic: { label: 'Generic', guidance: '' },
  banking: {
    label: 'Banking',
    guidance:
      'Banking role. Value financial analysis, credit risk, regulatory compliance (AML/KYC, Basel, IFRS), confidentiality and discretion, and experience in regulated financial institutions.'
  },
  insurance: {
    label: 'Insurance',
    guidance:
      'Insurance role. Value risk assessment, actuarial or underwriting basics, claims handling, insurance regulation (e.g. Solvency II) and client advisory experience.'
  },
  it: {
    label: 'IT',
    guidance:
      'IT role. Match programming languages, frameworks, databases and cloud platforms precisely, and weigh years of hands-on experience per technology over buzzwords.'
  },
  telecom: {
    label: 'Telecommunications',
    guidance:
      'Telecom engineering role. Value networking (IP, routing, switching), mobile networks (4G/5G, RF), fiber and transmission, and certifications such as CCNA/CCNP or vendor certifications.'
  }
}
