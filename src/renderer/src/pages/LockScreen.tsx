import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Fingerprint, Loader2, Lock } from 'lucide-react'
import { api, errorMessage } from '../api'
import { Helper } from '../components/Helper'
import { Button } from '../components/ui'

export default function LockScreen({ onUnlock }: { onUnlock: () => void }): ReactNode {
  const [status, setStatus] = useState<{ hasPin: boolean; pinRemoved: boolean } | null>(null)
  const [helloOk, setHelloOk] = useState(false)
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.lock.status().then((s) => {
      if (s.unlocked) onUnlock()
      else setStatus(s)
    })
    api.lock.helloAvailable().then(setHelloOk)
  }, [onUnlock])

  useEffect(() => input.current?.focus(), [status])

  if (!status) return <div className="h-full bg-[#efede8]" />

  const setup = !status.hasPin

  const submit = async (): Promise<void> => {
    setError(null)
    if (setup) {
      if (!/^\d{4,6}$/.test(pin)) return setError('Choose a PIN of 4 to 6 digits.')
      if (pin !== confirm) return setError("The two PINs don't match.")
      try {
        await api.lock.setPin(pin)
        onUnlock()
      } catch (e) {
        setError(errorMessage(e))
      }
      return
    }
    try {
      if (await api.lock.unlock(pin)) return onUnlock()
      setError('Wrong PIN. Try again.')
    } catch (e) {
      // too many wrong PINs: the main process enforces the wait
      setError(errorMessage(e))
    }
    setPin('')
  }

  const hello = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      if (await api.lock.hello()) onUnlock()
      else setError('Windows Hello didn’t verify you. Use your PIN instead.')
    } finally {
      setBusy(false)
    }
  }

  const pinInput = (value: string, set: (v: string) => void, placeholder: string, ref?: typeof input): ReactNode => (
    <input
      ref={ref}
      type="password"
      inputMode="numeric"
      maxLength={6}
      value={value}
      placeholder={placeholder}
      onChange={(e) => set(e.target.value.replace(/\D/g, ''))}
      onKeyDown={(e) => e.key === 'Enter' && submit()}
      className="w-full rounded-lg border border-stone-300 bg-white px-4 py-2.5 text-center text-lg tracking-[0.5em] outline-none placeholder:tracking-normal placeholder:text-sm focus:border-accent focus:ring-2 focus:ring-accent/15"
    />
  )

  return (
    <div className="flex h-full items-center justify-center bg-rail">
      <div className="w-[360px] rounded-md bg-white p-8 text-center shadow-[0_12px_40px_rgba(8,24,30,0.35)]">
        <div className="mx-auto mb-4 flex justify-center">
          <Helper size={64} title="Nour, your HR assistant" />
        </div>
        <div className="text-lg font-semibold">HR Assistant</div>
        <div className="mb-6 text-sm text-stone-500">
          {setup ? 'Choose a PIN. It hides HR data from anyone else at this computer.' : 'Unlock to continue.'}
        </div>
        {status.pinRemoved && (
          <div className="mb-4 rounded-md bg-needs-soft px-3 py-2 text-left text-sm text-needs">
            The PIN was removed. Setting a new one erases the saved Gmail connection and Gemini API key.
          </div>
        )}
        <div className="space-y-2.5">
          {pinInput(pin, setPin, setup ? 'New PIN' : 'PIN', input)}
          {setup && pinInput(confirm, setConfirm, 'Confirm PIN')}
          {error && <div className="text-sm text-rose-700">{error}</div>}
          <Button variant="primary" className="w-full justify-center py-2" onClick={submit}>
            <Lock size={14} /> {setup ? 'Set PIN and continue' : 'Unlock'}
          </Button>
          {!setup && helloOk && (
            <Button className="w-full justify-center py-2" onClick={hello} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Fingerprint size={15} />} Unlock with Windows Hello
            </Button>
          )}
        </div>
        <div className="mt-6 text-xs text-stone-400">
          Data stays on this computer, protected on disk by your Windows account and BitLocker.
        </div>
      </div>
    </div>
  )
}
