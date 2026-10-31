import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { join } from 'path'

export type Collection = 'jobs' | 'candidates' | 'emails'

export interface Db {
  list<T>(col: Collection): T[]
  get<T>(col: Collection, id: string): T | null
  put<T extends { id: string }>(col: Collection, item: T): T
  remove(col: Collection, id: string): void
}

export function writeJsonAtomic(file: string, data: unknown): void {
  const tmp = file + '.tmp'
  writeFileSync(tmp, JSON.stringify(data, null, 2))
  renameSync(tmp, file)
}

export function createDb(dir: string): Db {
  mkdirSync(dir, { recursive: true })
  const cache = new Map<Collection, Map<string, unknown>>()

  const load = (col: Collection): Map<string, unknown> => {
    let m = cache.get(col)
    if (!m) {
      const file = join(dir, `${col}.json`)
      const items: { id: string }[] = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : []
      m = new Map(items.map((i) => [i.id, i]))
      cache.set(col, m)
    }
    return m
  }
  const save = (col: Collection): void => writeJsonAtomic(join(dir, `${col}.json`), [...load(col).values()])

  return {
    list: <T>(col: Collection) => [...load(col).values()] as T[],
    get: <T>(col: Collection, id: string) => (load(col).get(id) as T) ?? null,
    put: (col, item) => {
      load(col).set(item.id, item)
      save(col)
      return item
    },
    remove: (col, id) => {
      load(col).delete(id)
      save(col)
    }
  }
}
