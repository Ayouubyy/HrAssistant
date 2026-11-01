// Features that appear in the app like any other, and open a "coming soon" page explaining them.
// Nothing here is implemented yet.
export type SoonId = 'interviews' | 'employeeQa' | 'people' | 'workforce' | 'credibility'

export interface SoonFeature {
  id: SoonId
  title: string
  summary: string
  will: string[]
  hrDecides: string
  // Short labels shown as a strip on the page, e.g. the statuses a feature will use.
  terms?: string[]
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
    title: 'Credibility check',
    summary:
      'An AI agent that checks the claims in a shortlisted CV against the evidence in the same CV, and prepares questions for the interview.',
    will: [
      'List the CV’s key claims, such as “3 years of Python” or “AWS certification”, with the section each comes from',
      'Look for evidence in roles, projects, dates, certifications and training, and give each claim a status',
      'Check the timeline: durations that don’t match the dates, overlapping jobs, unexplained gaps',
      'Write a trust report: the evidence for each claim, what stays unverified, and questions to ask in the interview'
    ],
    hrDecides:
      'It never says a candidate lies and never rejects anyone. A claim without proof is marked unverified, not false. You decide what to ask and what it means.',
    terms: ['Supported', 'Partly supported', 'Unverified', 'Needs clarification', 'Contradicted']
  }
]

export const soonFeature = (id: SoonId): SoonFeature => SOON.find((f) => f.id === id)!
