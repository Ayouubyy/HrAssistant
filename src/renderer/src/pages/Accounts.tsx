import { useEffect, useState, type ReactNode } from 'react'
import { Briefcase, Check, HardDrive, Loader2, Mail } from 'lucide-react'
import { api, errorMessage } from '../api'
import { Button, Card, Chip, Input, Label, PageHeader } from '../components/ui'

function SoonCard({ icon, name, text }: { icon: ReactNode; name: string; text: string }): ReactNode {
  return (
    <Card className="flex items-center gap-4 p-5 opacity-80">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-stone-100 text-stone-500">{icon}</div>
      <div className="flex-1">
        <div className="font-medium">{name}</div>
        <div className="text-sm text-stone-500">{text}</div>
      </div>
      <Chip>Coming soon</Chip>
    </Card>
  )
}

export default function Accounts(): ReactNode {
  const [status, setStatus] = useState<{ connected: boolean; user: string | null } | null>(null)
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.gmail.status().then(setStatus)
  }, [])

  const connect = async (): Promise<void> => {
    if (!user.includes('@') || pass.replace(/\s/g, '').length < 16) {
      setError('Enter your Gmail address and the 16-letter app password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.gmail.connect(user, pass)
      setPass('')
      setStatus(await api.gmail.status())
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Connected accounts"
        subtitle="Passwords are encrypted with Windows and never leave this computer."
      />
      <div className="space-y-3">
        <Card className="p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
              <Mail size={20} />
            </div>
            <div className="flex-1">
              <div className="font-medium">Gmail</div>
              <div className="text-sm text-stone-500">Read the HR inbox and send replies you approve.</div>
            </div>
            {status?.connected && (
              <Chip tone="success">
                <Check size={12} /> Connected
              </Chip>
            )}
          </div>
          {status?.connected ? (
            <div className="mt-4 flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2.5 text-sm">
              <span>{status.user}</span>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  await api.gmail.disconnect()
                  setStatus(await api.gmail.status())
                }}
              >
                Disconnect
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div>
                <Label>Gmail address</Label>
                <Input placeholder="rh.demo@gmail.com" value={user} onChange={(e) => setUser(e.target.value)} />
              </div>
              <div>
                <Label hint="Google Account → Security → 2-Step Verification → App passwords. It's 16 letters.">
                  App password
                </Label>
                <Input type="password" placeholder="abcd efgh ijkl mnop" value={pass} onChange={(e) => setPass(e.target.value)} />
              </div>
              {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</div>}
              <Button variant="primary" onClick={connect} disabled={busy}>
                {busy && <Loader2 size={14} className="animate-spin" />} Connect Gmail
              </Button>
            </div>
          )}
        </Card>
        <SoonCard icon={<Mail size={20} />} name="Outlook / Microsoft 365" text="Sort and answer HR emails in Outlook." />
        <SoonCard icon={<Briefcase size={20} />} name="LinkedIn" text="Import applicants from your job posts." />
        <SoonCard icon={<HardDrive size={20} />} name="Google Drive" text="Screen CVs stored in a shared folder." />
      </div>
    </div>
  )
}
