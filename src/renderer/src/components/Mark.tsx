import type { ReactNode } from 'react'

// States as printed marks: filled (needs HR), half (worth a look), outline (ready), ring (in progress).
export type MarkKind = 'needs' | 'look' | 'ready' | 'progress'

const LABEL: Record<MarkKind, string> = {
  needs: 'Needs your decision',
  look: 'Worth a look',
  ready: 'Ready',
  progress: 'In progress'
}

export function Mark({ kind }: { kind: MarkKind }): ReactNode {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" role="img" aria-label={LABEL[kind]} className="shrink-0">
      {kind === 'needs' && <rect x="1" y="1" width="10" height="10" fill="#c43325" />}
      {kind === 'look' && (
        <>
          <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="#161918" strokeWidth="1.2" />
          <rect x="1.5" y="1.5" width="4.5" height="9" fill="#161918" />
        </>
      )}
      {kind === 'ready' && <rect x="1" y="5" width="10" height="2" fill="#6a726e" />}
      {kind === 'progress' && (
        <rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="#a87412" strokeWidth="1.4" strokeDasharray="2 1.6" />
      )}
    </svg>
  )
}
