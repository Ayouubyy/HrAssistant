import { utilityProcess } from 'electron'
import { join } from 'path'
import type { EmailItem } from '../shared/types'
import { UnreadableFileError, UnsupportedFileError, type Extracted } from './cv/extract'
import { LIMITS, TooLargeError } from './security/active-content'

export type ParseRequest =
  | { kind: 'cv'; path: string }
  | { kind: 'email'; raw: Uint8Array; source: EmailItem['source']; attachDir: string }
export type ParseResponse = { ok: true; value: unknown } | { ok: false; name: string; message: string }

// The worker's errors come back by name, so callers can still tell "too large" from "unreadable".
function rebuild(name: string, message: string): Error {
  const e =
    name === 'TooLargeError'
      ? new TooLargeError(message)
      : name === 'UnreadableFileError'
        ? new UnreadableFileError()
        : name === 'UnsupportedFileError'
          ? Object.assign(new UnsupportedFileError(''), { message })
          : new Error(message)
  return e
}

// One short-lived utility process per file: a parser that hangs is killed for real at the timeout.
function run<T>(req: ParseRequest, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(join(__dirname, 'parser-worker.js'), [], {
      serviceName: 'HR Assistant file reader',
      env: { NODE_ENV: process.env.NODE_ENV ?? 'production' },
      stdio: 'ignore'
    })
    let done = false
    const finish = (fn: () => void): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.kill()
      fn()
    }
    const timer = setTimeout(() => finish(() => reject(new Error(`Reading this ${what} took too long, so it was skipped.`))), ms)
    child.on('message', (res: ParseResponse) =>
      finish(() => (res.ok ? resolve(res.value as T) : reject(rebuild(res.name, res.message))))
    )
    child.on('exit', () => finish(() => reject(new Error(`This ${what} couldn't be read safely.`))))
    child.on('spawn', () => child.postMessage(req))
  })
}

export const extractInWorker = (path: string): Promise<Extracted> => run({ kind: 'cv', path }, LIMITS.extractMs, 'file')

export const parseEmailInWorker = (raw: Buffer, source: EmailItem['source'], attachDir: string): Promise<EmailItem> =>
  run({ kind: 'email', raw: new Uint8Array(raw), source, attachDir }, LIMITS.extractMs, 'email')
