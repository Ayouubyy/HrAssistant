import { writeFileSync } from 'fs'
import { basename, extname, resolve, sep } from 'path'
import type { ReviewFlag } from '../../shared/types'

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g

// Makes a sender-supplied file name safe to write on Windows. Never returns a path, only a name.
export function safeFileName(name: string, fallback = 'attachment'): string {
  let n = basename(String(name ?? '').replace(/\\/g, '/'))
    .replace(CONTROL, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/, '')
    .trim()
  if (/^\.+$/.test(n)) n = ''
  if (RESERVED.test(n)) n = `_${n}`
  if (n.length > 120) {
    const ext = extname(n).slice(0, 10)
    n = n.slice(0, 120 - ext.length) + ext
  }
  return n || fallback
}

// "cv.pdf" twice becomes "cv.pdf" then "cv (2).pdf".
export function uniqueName(name: string, taken: Set<string>): string {
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  let candidate = name
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${stem} (${i})${ext}`
  taken.add(candidate.toLowerCase())
  return candidate
}

export function insideDir(dir: string, name: string): string {
  const target = resolve(dir, name)
  if (!target.startsWith(resolve(dir) + sep)) throw new Error('Unsafe file name.')
  return target
}

export const OPENABLE = ['.pdf', '.docx', '.txt', '.png', '.jpg', '.jpeg']
export const isOpenable = (fileName: string): boolean => OPENABLE.includes(extname(fileName).toLowerCase())

const RISKY_EXT =
  /\.(exe|com|scr|pif|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|hta|msi|msp|lnk|iso|img|vhdx?|jar|reg|cpl|dll|docm|dotm|xlsm|xltm|pptm|ppsm|one|chm)$/i

// Flags for a sender-supplied name: dangerous types, double extensions and right-to-left tricks.
export function fileNameFlags(original: string): ReviewFlag[] {
  const flags: ReviewFlag[] = []
  if (/[\u202a-\u202e\u2066-\u2069]/.test(original))
    flags.push({
      code: 'unsafe_attachment',
      severity: 'high',
      detail: 'An attachment name uses hidden right-to-left characters to disguise its real type.',
      evidence: original.replace(/[\u202a-\u202e\u2066-\u2069]/g, '⟲').slice(0, 120)
    })
  const clean = original.replace(CONTROL, '')
  if (/\.(pdf|docx?|jpe?g|png|txt|xlsx?)\s*\.[a-z0-9]{2,4}$/i.test(clean) && RISKY_EXT.test(clean))
    flags.push({
      code: 'unsafe_attachment',
      severity: 'high',
      detail: 'An attachment pretends to be a document but is a program.',
      evidence: clean.slice(0, 120)
    })
  else if (RISKY_EXT.test(clean))
    flags.push({ code: 'unsafe_attachment', severity: 'warn', detail: "An attachment is a type HR Assistant won't open.", evidence: clean.slice(0, 120) })
  return flags
}

// Mark of the Web: Office opens the file in Protected View and SmartScreen checks it.
export function markOfTheWeb(path: string): void {
  if (process.platform !== 'win32') return
  try {
    writeFileSync(`${path}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n')
  } catch {
    // not NTFS (e.g. a FAT USB drive): nothing to mark
  }
}
