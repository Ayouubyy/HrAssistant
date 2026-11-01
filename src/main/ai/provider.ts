export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AIProvider {
  readonly model: string
  json<T>(opts: { system: string; prompt: string; schema: object }): Promise<T>
  text(opts: { system: string; messages: ChatMessage[] }): Promise<string>
}

export class NoApiKeyError extends Error {
  constructor() {
    super('Add your Gemini API key in Settings first.')
  }
}

export class RetryableError extends Error {
  constructor(
    message: string,
    readonly delayMs?: number
  ) {
    super(message)
  }
}

export class OfflineError extends Error {
  constructor() {
    super("You're offline. Results already analyzed are still available.")
  }
}

// The model replied, but with something unusable ({} or missing fields). Retried once, never cached.
export class InvalidModelOutputError extends RetryableError {}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 4, baseDelayMs = 2000): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof RetryableError) || attempt >= maxRetries) throw e
      if (e instanceof InvalidModelOutputError && attempt >= 1) throw e
      const backoff = baseDelayMs * 2 ** attempt
      await sleep(Math.max(backoff, e.delayMs ?? 0) + Math.random() * baseDelayMs)
    }
  }
}
