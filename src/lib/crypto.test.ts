import crypto from 'crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { decrypt, decryptAccessToken, encrypt, encryptAccessToken } from './crypto'

const SECRET = 'test-secret-test-secret-test-secret'

/** 旧実装（sha256 を1回かけるだけ）で暗号化した文字列を作る */
function encryptWithLegacyKey(data: object): string {
  const key = crypto.createHash('sha256').update(SECRET).digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()])
  // 旧形式は版の前置きを持たない
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64url')
}

describe('crypto', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = SECRET
    delete process.env.AUTH_SECRET
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('暗号化して復号すると元に戻る', () => {
    const sealed = encrypt({ hello: 'こんにちは' })
    expect(decrypt<{ hello: string }>(sealed)).toEqual({ hello: 'こんにちは' })
  })

  it('新しい暗号文には鍵の版が載る', () => {
    expect(encrypt({ a: 1 }).startsWith('v2:')).toBe(true)
  })

  it('同じ平文でも毎回違う暗号文になる（IVを使い回さない）', () => {
    expect(encrypt({ a: 1 })).not.toBe(encrypt({ a: 1 }))
  })

  /*
    **これが落ちたら、DB に残っているアクセストークンとアプリの秘密が読めない。**
    旧鍵（sha256 1回）で暗号化された行は、全員の再ログインなしには作り直せない。
  */
  it('版の前置きが無い古い暗号文も、旧鍵で復号できる', () => {
    const legacy = encryptWithLegacyKey({ token: 'legacy-access-token' })
    expect(decrypt<{ token: string }>(legacy)).toEqual({ token: 'legacy-access-token' })
  })

  it('改竄された暗号文は null になる（認証タグを検証している）', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const sealed = encrypt({ a: 1 })
    const broken = `${sealed.slice(0, -2)}${sealed.endsWith('AA') ? 'BB' : 'AA'}`
    expect(decrypt(broken)).toBeNull()
  })

  it('鍵が違えば復号できない', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const sealed = encrypt({ a: 1 })
    process.env.NEXTAUTH_SECRET = 'another-secret-another-secret-xx'
    expect(decrypt(sealed)).toBeNull()
  })

  describe('アクセストークン', () => {
    it('暗号化して復号すると元に戻る', () => {
      const sealed = encryptAccessToken('token-abc')
      expect(sealed.startsWith('enc:v1:')).toBe(true)
      expect(decryptAccessToken(sealed)).toBe('token-abc')
    })

    it('暗号化されていない値は読まない', () => {
      expect(decryptAccessToken('plain-token')).toBeNull()
    })

    it('旧鍵で暗号化された値も復号できる', () => {
      const legacy = `enc:v1:${encryptWithLegacyKey({ token: 'old-token' })}`
      expect(decryptAccessToken(legacy)).toBe('old-token')
    })

    it('null と undefined は null になる', () => {
      expect(decryptAccessToken(null)).toBeNull()
      expect(decryptAccessToken(undefined)).toBeNull()
    })
  })

  describe('秘密の解決', () => {
    it('AUTH_SECRET だけでも同じ鍵になる（名前の移行に耐える）', () => {
      const sealed = encrypt({ a: 1 })
      delete process.env.NEXTAUTH_SECRET
      process.env.AUTH_SECRET = SECRET
      expect(decrypt<{ a: number }>(sealed)).toEqual({ a: 1 })
    })

    /*
      **黙って `AUTH_SECRET` を選ぶと、保存済みのトークンが全部読めなくなる。**
      症状は「投稿だけができない」で、原因から遠い。ここで落とす。
    */
    it('AUTH_SECRET と NEXTAUTH_SECRET が食い違っていたら投げる', () => {
      process.env.AUTH_SECRET = 'different-secret-different-secret'
      expect(() => encrypt({ a: 1 })).toThrow(/別の値/)
    })

    it('どちらも無ければ投げる', () => {
      delete process.env.NEXTAUTH_SECRET
      delete process.env.AUTH_SECRET
      expect(() => encrypt({ a: 1 })).toThrow(/設定されていません/)
    })
  })
})
