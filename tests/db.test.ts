import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { createDb } from '../src/main/store/db'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'hrdb-'))

describe('createDb', () => {
  it('returns what was put', () => {
    const db = createDb(tmp())
    db.put('jobs', { id: 'a', title: 'T' })
    expect(db.get('jobs', 'a')).toEqual({ id: 'a', title: 'T' })
  })
  it('replaces an item with the same id', () => {
    const db = createDb(tmp())
    db.put('jobs', { id: 'a', title: 'T' })
    db.put('jobs', { id: 'a', title: 'U' })
    expect(db.list('jobs')).toEqual([{ id: 'a', title: 'U' }])
  })
  it('survives reopening the same folder', () => {
    const dir = tmp()
    createDb(dir).put('jobs', { id: 'a' })
    expect(createDb(dir).get('jobs', 'a')).toEqual({ id: 'a' })
  })
  it('lists a missing collection as empty', () => {
    expect(createDb(tmp()).list('emails')).toEqual([])
  })
  it('removes an item', () => {
    const db = createDb(tmp())
    db.put('jobs', { id: 'a' })
    db.remove('jobs', 'a')
    expect(db.get('jobs', 'a')).toBeNull()
  })
})
