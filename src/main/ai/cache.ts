import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { writeJsonAtomic } from '../store/db'

export type Cached = <T>(key: string, fn: () => Promise<T>) => Promise<T>

export const sha256 = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex')

export const cacheKey = (...parts: string[]): string => parts.join('\u0000')

// The cache file for a key, so a deleted candidate's AI result can be deleted too.
export const cacheId = (key: string): string => sha256(key)

export function removeCached(dir: string, ids: string[]): void {
  for (const id of ids) if (/^[0-9a-f]{64}$/.test(id)) rmSync(join(dir, `${id}.json`), { force: true })
}

export function createCache(dir: string): Cached {
  mkdirSync(dir, { recursive: true })
  return async (key, fn) => {
    const file = join(dir, `${sha256(key)}.json`)
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')).value
    const value = await fn()
    writeJsonAtomic(file, { value })
    return value
  }
}
