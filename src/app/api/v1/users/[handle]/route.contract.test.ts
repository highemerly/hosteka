import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectContract, makeRequest, prismaMock, resetPrismaMock } from '@/test/contract'

vi.mock('@/lib/prisma', async () => ({ prisma: (await import('@/test/contract')).prismaMock }))

import { GET } from './route'

/*
  Prisma がそのまま返す形（機密込み）を模す。**わざと混ぜてある** —
  accessToken と ipAddresses が応答に出ないことを確かめるため。
  email はこのルートが返してはならない値（押して初めて見える）。
*/
const USER = {
  id: 'user_1',
  username: 'taro',
  displayName: 'テスト太郎',
  avatar: 'https://example.test/a.png',
  server: 'example.social',
  platform: 'mastodon',
  bio: 'よろしくお願いします',
  socialAccounts: '[{"platform":"misskey","username":"taro","server":"misskey.io"}]',
  homepageUrls: '["https://example.test"]',
  email: 'taro@example.test',
  accessToken: 'enc:v1:SECRET',
  ipAddresses: '["203.0.113.1"]',
  isAdmin: true,
  createdAt: new Date('2026-01-15T00:00:00.000Z'),
  ban: null,
  organizationAdmins: [
    { role: 'admin', organization: { id: 'org_1', slug: 'my-group', name: 'わたしの会' } },
  ],
}

const ctx = (handle: string) => ({ params: Promise.resolve({ handle }) })

beforeEach(() => {
  resetPrismaMock()
  prismaMock.user.findUnique.mockResolvedValue(USER)
  prismaMock.event.count.mockResolvedValue(3)
  prismaMock.preEvent.count.mockResolvedValue(2)
  prismaMock.eventParticipant.count.mockResolvedValue(12)
  prismaMock.preEventParticipant.groupBy.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }])
})

describe('GET /api/v1/users/[handle]', () => {
  it('未ログインでも詳細を返す（公開）', async () => {
    await expectContract(await GET(makeRequest('/api/v1/users/taro@example.social'), ctx('taro@example.social')))
  })

  it('機密もメールアドレスも応答に出ない', async () => {
    const response = await GET(
      makeRequest('/api/v1/users/taro@example.social'),
      ctx('taro@example.social')
    )
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(text).not.toContain('SECRET')
    expect(text).not.toContain('203.0.113.1')
    expect(text).not.toContain('taro@example.test')
    // 登録の有無だけは出す。無いと「押しても何も出ないボタン」を全員に見せる
    expect(text).toContain('"hasEmail":true')
  })

  it('メールアドレスが未登録なら hasEmail が false', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, email: null })
    const response = await GET(
      makeRequest('/api/v1/users/taro@example.social'),
      ctx('taro@example.social')
    )
    expect(await response.text()).toContain('"hasEmail":false')
  })

  it('Fediverse の書き方（@ 前置き）でも引ける', async () => {
    const response = await GET(
      makeRequest('/api/v1/users/@taro@example.social'),
      ctx('@taro@example.social')
    )
    expect(response.status).toBe(200)
    expect(prismaMock.user.findUnique.mock.calls[0][0].where).toEqual({
      username_server: { username: 'taro', server: 'example.social' },
    })
  })

  it('大文字混じりでも同じ人を引く', async () => {
    await GET(makeRequest('/api/v1/users/Taro@Example.Social'), ctx('Taro@Example.Social'))
    expect(prismaMock.user.findUnique.mock.calls[0][0].where).toEqual({
      username_server: { username: 'taro', server: 'example.social' },
    })
  })

  it('ハンドルの形になっていなければ404。DBも引かない', async () => {
    await expectContract(await GET(makeRequest('/api/v1/users/taro'), ctx('taro')))
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled()
  })

  it('居ない人は404', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null)
    await expectContract(
      await GET(makeRequest('/api/v1/users/nobody@example.social'), ctx('nobody@example.social'))
    )
  })

  /*
    停止中の人のページは無いものとして扱う。一覧に出ない人のページだけが
    開ける状態を作らない。
  */
  it('停止中の人は404', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ ...USER, ban: { id: 'ban_1' } })
    await expectContract(
      await GET(makeRequest('/api/v1/users/taro@example.social'), ctx('taro@example.social'))
    )
  })

  it('JSONの列が壊れていても200で、空の配列を返す', async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      ...USER,
      socialAccounts: '{broken',
      homepageUrls: 'null',
    })
    const response = await GET(
      makeRequest('/api/v1/users/taro@example.social'),
      ctx('taro@example.social')
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { socialAccounts: unknown[]; homepageUrls: unknown[] } }
    expect(body.data.socialAccounts).toEqual([])
    expect(body.data.homepageUrls).toEqual([])
  })

  /*
    **一覧（`./events`）と同じ条件で数える。** `isHighlighted: false` は
    「一覧や検索に出さない」という主催者への約束なので、本人のページにも
    並べない。一覧の切り替え（所属グループを含めるか）の両方の数を返す。
  */
  it('公開の条件で、所属グループを含む数と除く数の両方を数える', async () => {
    await GET(makeRequest('/api/v1/users/taro@example.social'), ctx('taro@example.social'))
    const wheres = prismaMock.event.count.mock.calls.map((call) => call[0].where.AND)
    expect(wheres).toEqual([
      [
        { isDisabled: false },
        { isPublic: true },
        { isHighlighted: true },
        {
          OR: [
            { creatorId: 'user_1' },
            { organization: { admins: { some: { userId: 'user_1' } } } },
          ],
        },
      ],
      [
        { isDisabled: false },
        { isPublic: true },
        { isHighlighted: true },
        { creatorId: 'user_1' },
        { organizationId: null },
      ],
    ])
  })

  /** 一覧はページ送りつきの `./events` が持つ。詳細は件数だけ */
  it('詳細は一覧を返さない', async () => {
    const response = await GET(
      makeRequest('/api/v1/users/taro@example.social'),
      ctx('taro@example.social')
    )
    const body = (await response.json()) as { data: Record<string, unknown> }
    expect(body.data).not.toHaveProperty('events')
    expect(body.data).not.toHaveProperty('preEvents')
    expect(prismaMock.event.findMany).not.toHaveBeenCalled()
  })

  it('のべ参加者は、席を取っている人だけ数える', async () => {
    await GET(makeRequest('/api/v1/users/taro@example.social'), ctx('taro@example.social'))
    expect(prismaMock.eventParticipant.count.mock.calls[0][0].where.status).toEqual({
      in: ['attending', 'maybe'],
    })
  })

  /*
    日程調整の回答の行は「候補日 × 人」で増える。行を数えると候補日を
    多く並べた人ほど大きな数字になるので、実人数で数える。
  */
  it('日程調整の回答者は groupBy で実人数を数える', async () => {
    await GET(makeRequest('/api/v1/users/taro@example.social'), ctx('taro@example.social'))
    expect(prismaMock.preEventParticipant.count).not.toHaveBeenCalled()
    expect(prismaMock.preEventParticipant.groupBy.mock.calls[0][0].by).toEqual(['userId'])
  })
})
