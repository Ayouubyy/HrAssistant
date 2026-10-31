import { ApiError, GoogleGenAI } from '@google/genai'
import type { AIProvider, ChatMessage } from './provider'
import { OfflineError, RetryableError } from './provider'
import { parseModelJson } from './json'

function translateError(e: unknown): unknown {
  if (e instanceof ApiError) {
    if (e.status === 429 || e.status >= 500) return new RetryableError(e.message)
    if (e.status === 400 && /api key/i.test(e.message)) return new Error('Your Gemini API key was rejected. Check it in Settings.')
    return new Error(`Gemini error ${e.status}: ${e.message.slice(0, 200)}`)
  }
  const msg = String((e as Error)?.message ?? e)
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|network/i.test(msg)) return new OfflineError()
  if (/ETIMEDOUT|ECONNRESET|socket hang up/i.test(msg)) return new RetryableError(msg)
  return e
}

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI

  constructor(
    apiKey: string,
    readonly model: string
  ) {
    this.client = new GoogleGenAI({ apiKey })
  }

  async json<T>({ system, prompt, schema }: { system: string; prompt: string; schema: object }): Promise<T> {
    try {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction: system,
          responseMimeType: 'application/json',
          responseJsonSchema: schema,
          temperature: 0.2
        }
      })
      return parseModelJson(res.text ?? '') as T
    } catch (e) {
      throw translateError(e)
    }
  }

  async text({ system, messages }: { system: string; messages: ChatMessage[] }): Promise<string> {
    try {
      const res = await this.client.models.generateContent({
        model: this.model,
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        })),
        config: { systemInstruction: system, temperature: 0.4 }
      })
      return res.text ?? ''
    } catch (e) {
      throw translateError(e)
    }
  }
}
