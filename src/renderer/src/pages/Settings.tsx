import { useEffect, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import type { AppSettings } from '@shared/types'
import { api } from '../api'
import { Button, Card, Input, Label, PageHeader, Textarea, Toggle } from '../components/ui'

export default function Settings(): ReactNode {
  const [s, setS] = useState<AppSettings | null>(null)
  const [hasKey, setHasKey] = useState(false)
  const [key, setKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api.settings.get().then(setS)
    api.settings.hasGeminiKey().then(setHasKey)
  }, [])

  if (!s) return null

  const save = async (): Promise<void> => {
    await api.settings.save(s)
    if (key.trim()) {
      await api.settings.setGeminiKey(key)
      setKey('')
      setHasKey(true)
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
