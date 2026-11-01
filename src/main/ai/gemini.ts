import { ApiError, GoogleGenAI } from '@google/genai'
import type { AIProvider, ChatMessage } from './provider'
import { OfflineError, RetryableError } from './provider'
import { parseModelJson } from './json'

const OFFLINE_CODES = ['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED']

function retryDelayMs(message: string): number | undefined {
  const m = message.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
  return m ? Math.ceil(Number(m[1]) * 1000) : undefined
}

export function translateError(e: unknown): unknown {
  if (e instanceof ApiError) {
    if (e.status === 429)
      return new RetryableError('The AI is getting too many requests. Wait a moment, then retry.', retryDelayMs(e.message))
    if (e.status >= 500) return new RetryableError('The AI service is busy. Wait a moment, then retry.')
    if ((e.status === 400 || e.status === 403) && /api[_ ]?key/i.test(e.message))
      return new Error('Your Gemini API key was rejected. Check it in Settings.')
    const detail = e.message.match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? e.message
    return new Error(`Gemini error ${e.status}: ${detail.slice(0, 160)}`)
  }
  const err = e as Error & { cause?: { code?: string } }
  const code = err?.cause?.code ?? (err as { code?: string })?.code ?? ''
  const msg = String(err?.message ?? e)
  if (OFFLINE_CODES.includes(code)) return new OfflineError()
  if (/fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|timeout|aborted/i.test(msg + code))
    return new RetryableError('The connection to the AI dropped. Retrying…')
  return e
}

export class GeminiProvider implements AIProvider {
  private client: GoogleGenAI

  constructor(
    apiKey: string,
    readonly model: string
  ) {
    this.client = new GoogleGenAI({ apiKey, httpOptions: { timeout: 60000 } })
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
          temperature: 0.2,
          // fixed seed: the same CV and job give the same scores more often (T-14)
          seed: 7
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
