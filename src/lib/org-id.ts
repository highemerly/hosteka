import crypto from 'crypto'

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'
const DEFAULT_LENGTH = 10

export function generateOrgSlug(length: number = DEFAULT_LENGTH): string {
  const bytes = crypto.randomBytes(length)
  let id = ''
  for (let i = 0; i < length; i++) {
    id += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return id
}

export function validateOrgSlug(slug: string): boolean {
  return /^[a-zA-Z0-9_-]{4,50}$/.test(slug)
}
