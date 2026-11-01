import { app, powerMonitor } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { writeJsonAtomic } from '../store/db'
import { getSecret, setSecret } from '../store/secrets'
import { getSettings } from '../store/settings'
import { helloAvailable, helloVerify } from './hello'
import { hashPin, verifyPin } from './pin'
import { afterFailure, waitSeconds, type ThrottleState } from './throttle'

let unlocked = false
export const isUnlocked = (): boolean => unlocked

// The Windows Hello probe runs PowerShell and takes a few seconds, so start it once at launch.
let hello: Promise<boolean> | null = null
const helloOnce = (): Promise<boolean> => (hello ??= helloAvailable())

// Kept on disk so restarting the app doesn't reset the wrong-PIN counter.
const stateFile = (): string => join(app.getPath('userData'), 'lock-state.json')
const readState = (): ThrottleState => {
  try {
    return existsSync(stateFile()) ? JSON.parse(readFileSync(stateFile(), 'utf8')) : { failures: 0, lockedUntil: 0 }
  } catch {
    return { failures: 0, lockedUntil: 0 }
  }
}
const writeState = (s: ThrottleState): void => writeJsonAtomic(stateFile(), s)

// Locks when Windows locks or sleeps, and after the idle time set in Settings.
export function startAutoLock(onLock: () => void): void {
  const lock = (): void => {
    if (!unlocked) return
    unlocked = false
    onLock()
  }
  powerMonitor.on('lock-screen', lock)
  powerMonitor.on('suspend', lock)
  setInterval(() => {
    const minutes = getSettings().autoLockMinutes
    if (minutes > 0 && powerMonitor.getSystemIdleTime() >= minutes * 60) lock()
  }, 30_000)
}

export function lockHandlers(): Record<string, (...a: never[]) => unknown> {
  void helloOnce()
  return {
    'lock:status': () => ({ hasPin: !!getSecret('pinHash'), unlocked, waitSeconds: waitSeconds(readState(), Date.now()) }),
    'lock:helloAvailable': () => helloOnce(),
    'lock:setPin': (pin: string) => {
      if (getSecret('pinHash') && !unlocked) throw new Error('Unlock first.')
      if (typeof pin !== 'string' || !/^\d{4,6}$/.test(pin)) throw new Error('Use 4 to 6 digits.')
      setSecret('pinHash', hashPin(pin))
      unlocked = true
    },
    'lock:unlock': (pin: string) => {
      const state = readState()
      const wait = waitSeconds(state, Date.now())
      if (wait) throw new Error(`Too many wrong PINs. Try again in ${wait} s.`)
      const stored = getSecret('pinHash')
      unlocked = !!stored && typeof pin === 'string' && verifyPin(pin, stored)
      if (unlocked) {
        writeState({ failures: 0, lockedUntil: 0 })
      } else {
        const next = afterFailure(state, Date.now())
        writeState(next)
        const w = waitSeconds(next, Date.now())
        if (w) throw new Error(`Too many wrong PINs. Try again in ${w} s.`)
      }
      return unlocked
    },
    'lock:hello': async () => {
      if (!getSecret('pinHash')) return false
      unlocked = await helloVerify('Unlock HR Assistant')
      if (unlocked) writeState({ failures: 0, lockedUntil: 0 })
      return unlocked
    },
    'lock:lock': () => {
      unlocked = false
    }
  }
}
