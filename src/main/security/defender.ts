import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export type ScanResult = 'clean' | 'threat' | 'unavailable'

const mpCmdRun = (): string => join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe')

// Explicit Microsoft Defender scan of one file (T-20). Exit code 0 = no threat, 2 = threat found
// (checked on Windows 11 for 0; 2 is Microsoft's documented code). Anything else counts as unavailable.
export function defenderScan(path: string): Promise<ScanResult> {
  if (process.platform !== 'win32' || !existsSync(mpCmdRun())) return Promise.resolve('unavailable')
  return new Promise((resolve) => {
    execFile(
      mpCmdRun(),
      ['-Scan', '-ScanType', '3', '-File', path, '-DisableRemediation'],
      { timeout: 60_000, windowsHide: true },
      (err) => {
        // execFile puts the process exit code in err.code (a number) when the scanner exits non-zero
        const code: unknown = err ? (err as unknown as { code?: unknown }).code : 0
        resolve(code === 0 ? 'clean' : code === 2 ? 'threat' : 'unavailable')
      }
    )
  })
}
