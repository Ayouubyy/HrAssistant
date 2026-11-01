// Runs in an Electron utility process (council review): CVs and emails are parsed here, away from the
// main process. A parser that hangs is killed with the process, and a crash or exploit in pdf.js,
// mammoth or mailparser doesn't take the app down. No secrets are passed in and its environment is empty.
import './worker-env' // must stay first: pdf.js checks process.type when it loads
import type { ParseRequest, ParseResponse } from './parse-host'

// The parsers are loaded on the first request, not at the top: the bundler would otherwise hoist the
// shared chunk that holds pdf.js above worker-env, and pdf.js would load before the fix.
const parsers = (): Promise<[typeof import('./cv/extract'), typeof import('./inbox/eml'), typeof import('./security/active-content')]> =>
  Promise.all([import('./cv/extract'), import('./inbox/eml'), import('./security/active-content')])

const port = process.parentPort

port.on('message', async (e: { data: ParseRequest }) => {
  const req = e.data
  const [cv, eml, active] = await parsers()
  let res: ParseResponse
  try {
    const value = req.kind === 'cv' ? await cv.extractText(req.path) : await eml.parseEmail(Buffer.from(req.raw), req.source, req.attachDir)
    res = { ok: true, value }
  } catch (err) {
    const name =
      err instanceof active.TooLargeError
        ? 'TooLargeError'
        : err instanceof cv.UnreadableFileError
          ? 'UnreadableFileError'
          : err instanceof cv.UnsupportedFileError
            ? 'UnsupportedFileError'
            : 'Error'
    res = { ok: false, name, message: (err as Error).message }
  }
  port.postMessage(res)
})
