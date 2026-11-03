import { NextRequest, NextResponse } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COOKIE_OAUTH_SESSION } from '@/lib/cookie-names'

vi.mock('@/lib/prisma', async () => ({
  prisma: (await import('@/test/contract')).prismaMock,
}))

import { prismaMock, resetPrismaMock } from '@/test/contract'

const issueSessionRedirect = vi.fn()
vi.mock('@/server/auth/oauth-callback', () => ({
  issueSessionRedirect: (...args: unknown[]) => issueSessionRedirect(...args),
}))
vi.mock('@/server/auth/terms', () => ({ recordTermsAcceptance: async () => undefined }))
vi.mock('@/lib/user-tracking', () => ({
  checkBannedUser: async () => false,
  updateUserLoginInfo: async () => undefined,
}))

import { encrypt, type HostedOAuthSessionData } from '@/lib/crypto'

import { GET as discordCallback } from './discord/route'
import { GET as twitterCallback } from './twitter/route'

/**
 * Discord と X のコールバック。
 *
 * **`state` は署名も保存もされていない只の base64。** これだけを見ると、
 * 攻撃者が自分の認可コードと自作の state を並べたリンクを踏ませるだけで、
 * 踏んだ人を攻撃者のアカウントでログインさせられる（同意の記録まで押される）。
 * Cookie の値と突き合わせることだけが「このブラウザで始めたログインか」を
 * 確かめる手段なので、ここで固定する。
 */
const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  resetPrismaMock()
  issueSessionRedirect.mockReset()
  issueSessionRedirect.mockImplementation(async () => NextResponse.redirect('https://hosteka.test/'))
  process.env.NEXTAUTH_SECRET = 'test-secret-test-secret-test-secret'
  process.env.NEXTAUTH_URL = 'https://hosteka.test'
  process.env.DISCORD_CLIENT_ID = 'discord-client'
  process.env.DISCORD_CLIENT_SECRET = 'discord-secret'
  process.env.TWITTER_CLIENT_ID = 'twitter-client'
  process.env.TWITTER_CLIENT_SECRET = 'twitter-secret'
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...ORIGINAL_ENV }
})

function sessionCookie(data: Partial<HostedOAuthSessionData> & { platform: HostedOAuthSessionData['platform'] }) {
  return encrypt({ csrf: 'correct-csrf', createdAt: Date.now(), ...data })
}

function request(
  platform: 'discord' | 'twitter',
  state: Record<string, unknown>,
  cookie: string | null
) {
  const encoded = Buffer.from(JSON.stringify(state)).toString('base64url')
  return new NextRequest(
    `https://hosteka.test/api/v1/auth/callback/${platform}?code=x&state=${encoded}`,
    { headers: cookie ? { cookie: `${COOKIE_OAUTH_SESSION}=${cookie}` } : {} }
  )
}

const callbacks = [
  { name: 'Discord', platform: 'discord' as const, handler: discordCallback },
  { name: 'X', platform: 'twitter' as const, handler: twitterCallback },
]

describe.each(callbacks)('$name のコールバック', ({ platform, handler }) => {
  const validCookie = () =>
    sessionCookie(platform === 'twitter' ? { platform, codeVerifier: 'verifier' } : { platform })

  it('Cookie が無ければ、state が整っていても進めない', async () => {
    const response = await handler(
      request(platform, { csrf: 'anything', timestamp: Date.now(), callbackUrl: '/' }, null)
    )

    expect(response.headers.get('location')).toContain('/auth/error?error=missing_session')
    expect(issueSessionRedirect).not.toHaveBeenCalled()
  })

  it('自作の state は、Cookie の csrf と合わなければ通らない', async () => {
    const response = await handler(
      request(
        platform,
        { csrf: 'forged-by-attacker', timestamp: Date.now(), callbackUrl: '/' },
        validCookie()
      )
    )

    expect(response.headers.get('location')).toContain('/auth/error?error=invalid_state')
    expect(issueSessionRedirect).not.toHaveBeenCalled()
  })

  it('別のプラットフォームで始めたログインの Cookie では通らない', async () => {
    const other = platform === 'discord' ? 'twitter' : 'discord'
    const response = await handler(
      request(
        platform,
        { csrf: 'correct-csrf', timestamp: Date.now(), callbackUrl: '/' },
        sessionCookie({ platform: other, codeVerifier: 'verifier' })
      )
    )

    expect(response.headers.get('location')).toContain('/auth/error?error=missing_session')
    expect(issueSessionRedirect).not.toHaveBeenCalled()
  })

  /*
    **期限は Cookie に合わせて10分。**
  */
  it('10分より古い state は通らない', async () => {
    const response = await handler(
      request(
        platform,
        { csrf: 'correct-csrf', timestamp: Date.now() - 11 * 60 * 1000, callbackUrl: '/' },
        validCookie()
      )
    )

    expect(response.headers.get('location')).toContain('/auth/error?error=expired_state')
    expect(issueSessionRedirect).not.toHaveBeenCalled()
  })

  it('csrf を欠いた state は通らない', async () => {
    const response = await handler(
      request(platform, { timestamp: Date.now(), callbackUrl: '/' }, validCookie())
    )

    expect(response.headers.get('location')).toContain('/auth/error?error=invalid_state')
    expect(issueSessionRedirect).not.toHaveBeenCalled()
  })

  it('壊れた state は通らない', async () => {
    const response = await handler(
      new NextRequest(
        `https://hosteka.test/api/v1/auth/callback/${platform}?code=x&state=%%%`,
        { headers: { cookie: `${COOKIE_OAUTH_SESSION}=${validCookie()}` } }
      )
    )

    expect(response.headers.get('location')).toContain('/auth/error')
    expect(issueSessionRedirect).not.toHaveBeenCalled()
  })
})

describe('X のコールバック（PKCE）', () => {
  /*
    **`code_verifier` は Cookie から取る。** state に載せると、
    challenge と verifier の両方を攻撃者が決められ、PKCE が何も縛らない。
  */
  it('state に codeVerifier を詰めても、トークン交換には Cookie の値を使う', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      void init
      if (String(url).includes('oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'at' }), { status: 200 })
      }
      return new Response(
        JSON.stringify({ data: { id: '1', name: 'Alice', username: 'alice' } }),
        { status: 200 }
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    prismaMock.user.upsert.mockResolvedValue({
      id: 'u1',
      username: 'alice',
      server: 'x.com',
      platform: 'twitter',
      lastTermsAcceptedAt: new Date(),
    })

    await twitterCallback(
      request(
        'twitter',
        {
          csrf: 'correct-csrf',
          timestamp: Date.now(),
          callbackUrl: '/',
          codeVerifier: 'attacker-chosen-verifier',
        },
        sessionCookie({ platform: 'twitter', codeVerifier: 'verifier-from-cookie' })
      )
    )

    const tokenCall = fetchMock.mock.calls.find(([url]) => String(url).includes('oauth2/token'))
    expect(tokenCall).toBeDefined()
    const sentBody = String(tokenCall?.[1]?.body)
    expect(sentBody).toContain('code_verifier=verifier-from-cookie')
    expect(sentBody).not.toContain('attacker-chosen-verifier')
  })

  it('Cookie に codeVerifier が無ければ進めない', async () => {
    const response = await twitterCallback(
      request(
        'twitter',
        { csrf: 'correct-csrf', timestamp: Date.now(), callbackUrl: '/' },
        sessionCookie({ platform: 'twitter' })
      )
    )

    expect(response.headers.get('location')).toContain('/auth/error?error=missing_session')
    expect(issueSessionRedirect).not.toHaveBeenCalled()
  })
})
