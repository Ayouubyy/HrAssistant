import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createCache } from '../src/main/ai/cache'
import { clamp100, parseModelJson } from '../src/main/ai/json'

describe('parseModelJson', () => {
  it('strips code fences', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })
  it('extracts the first object from surrounding text', () => {
    expect(parseModelJson('text {"a":1} trailing')).toEqual({ a: 1 })
  })
  it('throws when there is no JSON', () => {
    expect(() => parseModelJson('no json here')).toThrow()
  })
})

describe('clamp100', () => {
  it('clamps and defaults', () => {
    expect(clamp100(140)).toBe(100)
    expect(clamp100(-3)).toBe(0)
    expect(clamp100('x')).toBe(0)
    expect(clamp100('72')).toBe(72)
  })
})

describe('cache', () => {
  it('runs the function once per key', async () => {
    const cached = createCache(mkdtempSync(join(tmpdir(), 'hrc-')))
    let calls = 0
    const fn = async (): Promise<number> => ++calls
    expect(await cached('k1', fn)).toBe(1)
    expect(await cached('k1', fn)).toBe(1)
    expect(await cached('k2', fn)).toBe(2)
    expect(calls).toBe(2)
  })
  it('does not cache failures', async () => {
    const cached = createCache(mkdtempSync(join(tmpdir(), 'hrc-')))
    await expect(cached('k', async () => Promise.reject(new Error('x')))).rejects.toThrow()
    expect(await cached('k', async () => 5)).toBe(5)
  })
})
