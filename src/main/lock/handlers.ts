import { getSecret, setSecret } from '../store/secrets'
import { helloAvailable, helloVerify } from './hello'
import { hashPin, verifyPin } from './pin'

let unlocked = false
export const isUnlocked = (): boolean => unlocked

// The Windows Hello probe runs PowerShell and takes a few seconds, so start it once at launch.
let hello: Promise<boolean> | null = null
const helloOnce = (): Promise<boolean> => (hello ??= helloAvailable())

export function lockHandlers(): Record<string, (...a: never[]) => unknown> {
  void helloOnce()
  return {
    'lock:status': () => ({ hasPin: !!getSecret('pinHash'), unlocked }),
    'lock:helloAvailable': () => helloOnce(),
    'lock:setPin': (pin: string) => {
      if (getSecret('pinHash') && !unlocked) throw new Error('Unlock first.')
      if (!/^\d{4,6}$/.test(pin)) throw new Error('Use 4 to 6 digits.')
      setSecret('pinHash', hashPin(pin))
      unlocked = true
    },
    'lock:unlock': (pin: string) => {
      const stored = getSecret('pinHash')
      unlocked = !!stored && verifyPin(pin, stored)
      return unlocked
    },
    'lock:hello': async () => {
      if (!getSecret('pinHash')) return false
      unlocked = await helloVerify('Unlock HR Assistant')
      return unlocked
    },
    'lock:lock': () => {
      unlocked = false
    }
  }
}
