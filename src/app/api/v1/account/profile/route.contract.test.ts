import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PERSONAS, expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))
vi.mock('@/server/auth/session', async () => {
  const actual = await vi.importActual<typeof import('@/server/auth/session')>(
    '@/server/auth/session'
  )
  return { ...actual, getSession: vi.fn(), isAdminUser: vi.fn() }
})

import { getSession } from '@/server/auth/session'
import { GET, PUT } from './route'

const mockGetSession = vi.mocked(getSession)

const STORED = {
  bio: 'よろしくお願いします',
  email: 'taro@example.test',
  socialAccounts: '[{"platform":"misskey","username":"taro","server":"misskey.io"}]',
  homepageUrls: '["https://example.test"]',
}

const BODY = {
  bio: 'よろしく',
  email: 'taro@example.test',
  socialAccounts: [{ platform: 'mastodon', username: 'taro', server: 'example.social' }],
  homepageUrls: ['https://example.test'],
}

const put = (body: unknown) =>
  makeRequest('/api/v1/account/profile', { method: 'PUT', body })

beforeEach(() => {
  resetPrismaMock()
  mockGetSession.mockReset()
  mockGetSession.mockResolvedValue(PERSONAS.user)
  prismaMock.user.findUnique.mockResolvedValue(STORED)
  prismaMock.user.update.mockResolvedValue(STORED)
})

describe('GET /api/v1/account/profile', () => {
  it('自分のプロフィールを返す', async () => {
    await expectContract(await GET(makeRequest('/api/v1/account/profile'), {}))
  })

  it('未ログインでは401', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    await expectContract(await GET(makeRequest('/api/v1/account/profile'), {}))
  })

  it('自分の行だけを引く。IDを渡されて他人を読むことがない', async () => {
    await GET(makeRequest('/api/v1/account/profile'), {})
    expect(prismaMock.user.findUnique.mock.calls[0][0].where).toEqual({ id: 'user_1' })
  })
})

describe('PUT /api/v1/account/profile', () => {
  it('保存して、更新後の値を返す', async () => {
    await expectContract(await PUT(put(BODY), {}))
  })

  it('未ログインでは401。DBに触らない', async () => {
    mockGetSession.mockResolvedValue(PERSONAS.anonymous)
    await expectContract(await PUT(put(BODY), {}))
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })

  it('セッションの本人だけを更新する', async () => {
    await PUT(put(BODY), {})
    expect(prismaMock.user.update.mock.calls[0][0].where).toEqual({ id: 'user_1' })
  })

  it('空の配列は null で持つ', async () => {
    await PUT(put({ ...BODY, socialAccounts: [], homepageUrls: [] }), {})
    const data = prismaMock.user.update.mock.calls[0][0].data
    expect(data.socialAccounts).toBeNull()
    expect(data.homepageUrls).toBeNull()
  })

  it('SNSの上限を超えると400', async () => {
    const rows = Array.from({ length: 6 }, () => ({
      platform: 'misskey',
      username: 'taro',
      server: 'misskey.io',
    }))
    await expectContract(await PUT(put({ ...BODY, socialAccounts: rows }), {}))
  })

  it('ホームページの上限を超えると400', async () => {
    await expectContract(
      await PUT(
        put({ ...BODY, homepageUrls: ['https://a.test', 'https://b.test', 'https://c.test'] }),
        {}
      )
    )
  })

  it('形になっていないメールアドレスは400', async () => {
    await expectContract(await PUT(put({ ...BODY, email: 'taro' }), {}))
  })

  /*
    画面は X と Discord にサーバー欄を出さないが、本文では固定値を要求する。
    users.server（x.com / discord.com 固定）と形をそろえるため。
  */
  it('X のサーバーを付けずに送ると400', async () => {
    await expectContract(
      await PUT(
        put({ ...BODY, socialAccounts: [{ platform: 'twitter', username: 'taro', server: '' }] }),
        {}
      )
    )
  })

  /*
    PUT は全体の置き換えなので、キーを落として送れるようにすると
    「運ぶのを忘れた項目が黙って消える」。スキーマ側で必須にしてある。
  */
  it('項目を落として送ると400。黙って消えない', async () => {
    await expectContract(
      await PUT(put({ bio: 'よろしく', email: null, homepageUrls: [] }), {})
    )
    expect(prismaMock.user.update).not.toHaveBeenCalled()
  })
})
