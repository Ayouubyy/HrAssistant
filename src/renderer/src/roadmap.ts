// Roadmap features shown in the UI as "coming soon". Nothing here is implemented.
export type SoonId = 'interviews' | 'employeeQa' | 'people' | 'workforce' | 'credibility' | 'roadmap'

export interface SoonFeature {
  id: Exclude<SoonId, 'roadmap'>
  title: string
  summary: string
  will: string[]
  hrDecides: string
}

export const SOON: SoonFeature[] = [
  {
    id: 'interviews',
    title: 'Interviews',
    summary: 'Schedule interviews with shortlisted candidates and prepare questions that test what their CVs claim.',
    will: [
      'Propose interview slots from your calendar and send invitations you approve',
      'Suggest 3 to 5 questions per candidate, aimed at their strongest claims',
      'Keep interview notes next to the CV and the screening result'
    ],
    hrDecides: 'You pick the slots, edit the questions and send every invitation yourself.'
  },
  {
    id: 'employeeQa',
    title: 'Employee Q&A',
    summary: 'Employees ask about leave, payroll and policy, and get answers taken only from your company policy.',
    will: [
      'Answer common questions in French, English and Arabic',
      'Say "HR will come back to you" when the policy doesn’t cover it',
      'Collect unanswered questions so you can extend the policy'
    ],
    hrDecides: 'New answers go live only after you approve them.'
  },
  {
    id: 'people',
    title: 'People growth',
    summary: 'Follow performance reviews, training and skills gaps across teams.',
    will: [
      'Track review cycles and who is due',
      'Match training to the skills each role needs',
      'Show skills gaps by team before you open a job filter'
    ],
    hrDecides: 'Assessments stay with managers and HR; the assistant only organises them.'
  },
  {
    id: 'workforce',
    title: 'Workforce planning',
    summary: 'Plan hiring needs by team from departures, growth targets and open roles.',
    will: [
      'Forecast open roles per team for the next quarters',
      'Turn a planned role into a job filter in one step',
      'Flag teams that depend on a single person for a key skill'
    ],
    hrDecides: 'Plans are proposals; headcount decisions stay with HR and management.'
  },
  {
    id: 'credibility',
    title: 'CV credibility check',
    summary: 'A background check on each shortlisted CV, built only from what the CV itself says.',
    will: [
      'Spot overlapping full-time jobs, impossible dates and unexplained gaps',
      'Compare job titles with years of experience',
      'Combine these with the existing security checks into one trust note'
    ],
    hrDecides: 'Low trust sends a CV to Needs review, never to rejection. No profile scraping.'
  }
]

export interface RoadmapRow {
  group: string
  name: string
  line: string
}

export const ROADMAP: RoadmapRow[] = [
  { group: 'Recruitment', name: 'Interviews', line: 'Scheduling and interview question prep' },
  { group: 'Recruitment', name: 'CV credibility check', line: 'Consistency checks on dates and claims' },
  { group: 'Recruitment', name: 'More industry presets', line: 'Manufacturing and healthcare' },
  { group: 'Recruitment', name: 'Scanned CVs', line: 'Read image-only PDFs with OCR' },
  { group: 'People', name: 'Employee Q&A', line: 'Policy answers for employees, approved by HR' },
  { group: 'People', name: 'People growth', line: 'Performance, training and skills gaps' },
  { group: 'People', name: 'Workforce planning', line: 'Hiring needs by team' },
  { group: 'Connected accounts', name: 'Outlook', line: 'Microsoft 365 mailboxes' },
  { group: 'Connected accounts', name: 'LinkedIn', line: 'Import applicants from job posts' },
  { group: 'Connected accounts', name: 'Google Drive', line: 'Pick CVs from shared folders' },
  { group: 'Security and privacy', name: 'Local injection detector', line: 'A small model on this computer that spots hidden instructions' },
  { group: 'Security and privacy', name: 'Encrypted storage', line: 'CVs and emails encrypted inside HR Assistant' },
  { group: 'Everywhere', name: 'Website and mobile app', line: 'Review and decide away from the laptop' }
]
