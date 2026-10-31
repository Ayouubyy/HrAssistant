import { describe, expect, it } from 'vitest'
import { hashPin, verifyPin } from '../src/main/lock/pin'

describe('pin', () => {
  it('verifies the right PIN', () => {
    expect(verifyPin('1234', hashPin('1234'))).toBe(true)
  })
  it('rejects a wrong PIN', () => {
    expect(verifyPin('1235', hashPin('1234'))).toBe(false)
  })
  it('salts each hash', () => {
    expect(hashPin('1234')).not.toBe(hashPin('1234'))
  })
  it('rejects a malformed stored value', () => {
    expect(verifyPin('1234', 'garbage')).toBe(false)
  })
})
