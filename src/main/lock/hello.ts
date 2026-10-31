import { execFile } from 'child_process'

// Windows Hello through the WinRT UserConsentVerifier, driven from PowerShell 5.1.
const PRELUDE = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1' })[0]
function Await($op, $type) { $t = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $t.Wait(-1) | Out-Null; $t.Result }
$V = [Windows.Security.Credentials.UI.UserConsentVerifier, Windows.Security.Credentials.UI, ContentType = WindowsRuntime]
`

function run(script: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PRELUDE + script],
      { timeout: timeoutMs, windowsHide: true },
      (err, stdout) => resolve(err ? '' : stdout.trim())
    )
  })
}

export async function helloAvailable(): Promise<boolean> {
  if (process.platform !== 'win32') return false
  const out = await run(
    `Await ($V::CheckAvailabilityAsync()) ([Windows.Security.Credentials.UI.UserConsentVerifierAvailability])`,
    15000
  )
  return out === 'Available'
}

export async function helloVerify(message: string): Promise<boolean> {
  if (process.platform !== 'win32') return false
  const safe = message.replace(/'/g, "''")
  const out = await run(
    `Await ($V::RequestVerificationAsync('${safe}')) ([Windows.Security.Credentials.UI.UserConsentVerificationResult])`,
    120000
  )
  return out === 'Verified'
}
