// Runs in an Electron utility process (council review): CVs and emails are parsed here, away from the
// main process. A parser that hangs is killed with the process, and a crash or exploit in pdf.js,
// mammoth or mailparser doesn't take the app down. No secrets are passed in and its environment is empty.
import { extractText, UnreadableFileError, UnsupportedFileError } from './cv/extract'
import { parseEmail } from './inbox/eml'
import { TooLargeError } from './security/active-content'
import type { ParseRequest, ParseResponse } from './parse-host'

const errorName = (e: unknown): string =>
  e instanceof TooLargeError
    ? 'TooLargeError'
    : e instanceof UnreadableFileError
      ? 'UnreadableFileError'
      : e instanceof UnsupportedFileError
        ? 'UnsupportedFileError'
        : 'Error'

const port = process.parentPort

port.on('message', async (e: { data: ParseRequest }) => {
  const req = e.data
  let res: ParseResponse
  try {
    const value =
      req.kind === 'cv' ? await extractText(req.path) : await parseEmail(Buffer.from(req.raw), req.source, req.attachDir)
    res = { ok: true, value }
  } catch (err) {
    res = { ok: false, name: errorName(err), message: (err as Error).message }
  }
  port.postMessage(res)
})
