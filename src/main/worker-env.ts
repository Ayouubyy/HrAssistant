// Imported first by parser-worker.ts. pdf.js only treats Electron's main process (process.type
// 'browser') as Node.js; in a utility process it skips its Node set-up (the DOMMatrix polyfill, file
// loading) and crashes while loading, so every CV failed. Present the worker the same way as main.
if ((process as { type?: string }).type === 'utility') {
  Object.defineProperty(process, 'type', { value: 'browser', configurable: true })
}
