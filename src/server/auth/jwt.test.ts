import { describe, it, expect, beforeAll } from 'vitest'

import { SESSION_MAX_AGE_SEC, TOKEN_VERSION, signSession, verifySession } from './jwt'

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = 'test-secret-do-not-use-in-production'
})

const base = { userId: 'user_1', sessionId: 'sess_1', isAdmin: false }

describe('signSession / verifySession', () => {
  it('発行したトークンを検証できる', async () => {
    const token = await signSession(base)
    const claims = await verifySession(token)
    expect(claims).toMatchObject({ sub: 'user_1', sid: 'sess_1', adm: false, v: TOKEN_VERSION })
  })

  it('isAdmin がヒントとして載る', async () => {
    const claims = await verifySession(await signSession({ ...base, isAdmin: true }))
    expect(claims?.adm).toBe(true)
  })

  it('表示用の値や認可入力を載せない', async () => {
    // displayName / avatar / username / server / platform / accessToken が
    // トークンに混入すると、陳腐化した値で認可判断が行われる危険がある。
    const token = await signSession(base)
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
    for (const k of ['name', 'email', 'picture', 'username', 'server', 'platform', 'accessToken']) {
      expect(payload, k).not.toHaveProperty(k)
    }
  })

  it('改竄されたトークンを拒否する', async () => {
    const token = await signSession(base)
    const [h, p, s] = token.split('.')
    const tampered = JSON.parse(Buffer.from(p, 'base64url').toString())
    tampered.adm = true
    const forged = `${h}.${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${s}`
    expect(await verifySession(forged)).toBeNull()
  })

  it('別のシークレットで署名されたトークンを拒否する', async () => {
    const token = await signSession(base)
    process.env.NEXTAUTH_SECRET = 'another-secret'
    const result = await verifySession(token)
    process.env.NEXTAUTH_SECRET = 'test-secret-do-not-use-in-production'
    expect(result).toBeNull()
  })

  it('期限切れトークンを拒否する', async () => {
    const token = await signSession({ ...base, maxAgeSec: -10 })
    expect(await verifySession(token)).toBeNull()
  })

  it('壊れた文字列を拒否する', async () => {
    for (const t of ['', 'x', 'a.b.c', 'not-a-jwt']) {
      expect(await verifySession(t)).toBeNull()
    }
  })

  it('既定の有効期間は14日', async () => {
    const claims = await verifySession(await signSession(base))
    expect(claims!.exp - claims!.iat).toBe(SESSION_MAX_AGE_SEC)
    expect(SESSION_MAX_AGE_SEC).toBe(14 * 24 * 60 * 60)
  })
})
