import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pin, salt, 32).toString('hex')}`
}

export function verifyPin(pin: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash || hash.length !== 64) return false
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(pin, salt, 32))
}
