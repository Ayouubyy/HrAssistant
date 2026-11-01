import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

export type ScanResult = 'clean' | 'threat' | 'unavailable'

const mpCmdRun = (): string => join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Windows Defender', 'MpCmdRun.exe')

// MpCmdRun also exits with 2 when the scan itself fails ("CmdTool: Failed with hr = 0x80508023", seen
// on files in the app's data folder), so exit code 2 alone isn't a threat: every CV was flagged as
// malware. A threat needs Defender's own report of one.
export function readScan(code: unknown, output: string): ScanResult {
  if (/CmdTool: Failed/i.test(output)) return 'unavailable'
  if (code === 0 || /found no threats/i.test(output)) return 'clean'
  if (code === 2 && /found [1-9]\d* threats|LIST OF DETECTED THREATS/i.test(output)) return 'threat'
  return 'unavailable'
}

// Explicit Microsoft Defender scan of one file (T-20).
export function defenderScan(path: string): Promise<ScanResult> {
  if (process.platform !== 'win32' || !existsSync(mpCmdRun())) return Promise.resolve('unavailable')
  return new Promise((resolve) => {
    execFile(
      mpCmdRun(),
      ['-Scan', '-ScanType', '3', '-File', path, '-DisableRemediation'],
      { timeout: 60_000, windowsHide: true },
      (err, stdout, stderr) => {
        // execFile puts the process exit code in err.code (a number) when the scanner exits non-zero
        const code: unknown = err ? (err as unknown as { code?: unknown }).code : 0
        resolve(readScan(code, `${stdout}\n${stderr}`))
      }
    )
  })
}
