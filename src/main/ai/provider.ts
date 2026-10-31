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

export class RetryableError extends Error {}

export class OfflineError extends Error {
  constructor() {
    super("You're offline. Results already analyzed are still available.")
  }
}
