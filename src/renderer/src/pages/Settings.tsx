import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, Check } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { api, errorMessage } from '../api'
import { Button, Card, Chip, Input, Label, PageHeader, Textarea, Toggle } from '../components/ui'

export default function Settings(): ReactNode {
  const [s, setS] = useState<AppSettings | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [domains, setDomains] = useState('')

  useEffect(() => {
    api.settings.get().then((x) => {
      setS(x)
      setDomains(x.companyDomains.join(', '))
    })
    api.settings.hasGeminiKey().then(setHasKey)
  }, [])

  if (!s) return null

  const save = async (): Promise<void> => {
    setError(null)
    try {
      await api.settings.save(s)
      if (key.trim()) {
        await api.settings.setGeminiKey(key)
        setKey('')
        setHasKey(true)
      }
    } catch (e) {
      return setError(errorMessage(e))
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 1800)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Settings"
        subtitle="Everything here is stored on this computer."
        actions={
          <Button variant="primary" onClick={save}>
            {saved ? <Check size={15} /> : null}
            {saved ? 'Saved' : 'Save changes'}
          </Button>
        }
      />
      {error && <div className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
      <div className="space-y-4">
        <Card className="space-y-4 p-5">
          <div className="text-sm font-semibold">AI model</div>
          <div>
            <Label hint="Your own Google Gemini API key. It's encrypted with Windows before being saved.">
              API key
            </Label>
            <Input
              type="password"
              placeholder={hasKey ? 'A key is saved. Paste a new one to replace it' : 'Paste your Gemini API key'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            {hasKey && (
              <div className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
                <Check size={13} /> Key saved
              </div>
            )}
            <div className="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              <span>
                Free Gemini keys let Google use what you send (CV and email text) to improve its products, and people may review
                it. Use a key from a billing-enabled Google Cloud project for real candidate data. Use test data with a free key.
              </span>
            </div>
          </div>
          <div>
            <Label hint="gemini-flash-lite-latest is fastest. gemini-flash-latest is smarter but can be slow at busy times.">Model</Label>
            <Input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} />
          </div>
          <Toggle
            checked={s.doubleCheck}
            onChange={(v) => setS({ ...s, doubleCheck: v })}
            label="Double-check candidates close to the threshold (uses more AI calls)"
          />
        </Card>

        <Card className="space-y-4 p-5">
          <div className="text-sm font-semibold">Security and privacy</div>
          <div>
            <Label hint="Emails from these domains count as internal: only they get answers based on the company policy. Lookalike domains are flagged. Separate with commas, e.g. atlasbank.ma">
              Company email domains
            </Label>
            <Input
              placeholder="yourcompany.com"
              value={domains}
              onChange={(e) => {
                setDomains(e.target.value)
                setS({
                  ...s,
                  companyDomains: e.target.value
                    .split(',')
                    .map((x) => x.trim().toLowerCase().replace(/^@/, ''))
                    .filter((x) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(x))
                })
              }}
            />
            {!s.companyDomains.length && (
              <div className="mt-1 text-xs text-amber-800">
                No domain set: the policy is used for every sender, and lookalike domains can't be detected.
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label hint="0 turns it off. It also locks when Windows locks or sleeps.">Lock after inactivity (minutes)</Label>
              <Input
                type="number"
                min={0}
                max={240}
                value={s.autoLockMinutes}
                onChange={(e) => setS({ ...s, autoLockMinutes: Math.max(0, Math.min(240, Math.round(Number(e.target.value) || 0))) })}
              />
            </div>
            <div>
              <Label hint="Candidates of jobs you closed are deleted this many days later. 0 keeps them.">
                Delete candidates of closed jobs after (days)
              </Label>
              <Input
                type="number"
                min={0}
                max={3650}
                value={s.retentionDays}
                onChange={(e) => setS({ ...s, retentionDays: Math.max(0, Math.min(3650, Math.round(Number(e.target.value) || 0))) })}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2.5 text-sm">
            <div>
              <div className="font-medium text-stone-800">Local AI injection detector</div>
              <div className="text-xs text-stone-500">
                A small model on this computer that spots hidden instructions the phrase checks miss. No data leaves the laptop.
              </div>
            </div>
            <Chip tone="accent">Coming soon</Chip>
          </div>
          <div className="text-xs text-stone-500">
            The PIN lock hides HR data from anyone else at this computer; it doesn&apos;t encrypt it. CVs and emails are stored
            in your Windows profile, protected by your Windows account. Turn on BitLocker so they stay safe if the laptop is lost
            or stolen. Encryption inside HR Assistant is on the roadmap.
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-stone-200 pt-4">
            <div>
              <div className="text-sm font-medium text-stone-800">Decision log</div>
              <div className="text-xs text-stone-500">
                Every shortlist, rejection, restore, dismissed flag and sent reply, with who did it, when, and the settings at the
                time. It holds reference numbers only, no CV or email text.
              </div>
            </div>
            <Button size="sm" onClick={() => void api.audit.exportCsv().catch((e) => setError(errorMessage(e)))}>
              Export CSV
            </Button>
          </div>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="text-sm font-semibold">Inbox</div>
          <div>
            <Label hint="The assistant uses this as its only source when drafting answers to policy questions.">
              Company policy
            </Label>
            <Textarea
              rows={7}
              placeholder="Annual leave: 22 working days per year. Working hours: 9:00–17:30, Monday to Friday…"
              value={s.policyText}
              onChange={(e) => setS({ ...s, policyText: e.target.value })}
            />
          </div>
          <div>
            <Label hint="Job applications missing any of these get flagged. Separate with commas.">
              Required application documents
            </Label>
            <Input
              value={s.requiredDocs.join(', ')}
              onChange={(e) =>
                setS({
                  ...s,
                  requiredDocs: e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter(Boolean)
                })
              }
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
