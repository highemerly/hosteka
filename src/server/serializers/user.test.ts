import { describe, it, expect } from 'vitest'

import {
  FORBIDDEN_USER_FIELDS,
  serializeUser,
  serializeUserProfile,
} from './user'

// Prisma がそのまま返してくる形（機密込み）を模す
const rawUser = {
  id: 'u1',
  username: 'taro',
  displayName: 'テスト太郎',
  avatar: 'https://example.test/a.png',
  server: 'example.social',
  platform: 'mastodon',
  isAdmin: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  bio: 'よろしく',
  socialAccounts: '[{"platform":"misskey","username":"taro","server":"misskey.io"}]',
  homepageUrls: '["https://example.test"]',
  email: 'taro@example.test',
  accessToken: 'enc:v1:SECRET',
  ipAddresses: '["203.0.113.1"]',
  lastLoginAt: new Date(),
  lastTermsAcceptedAt: new Date(),
  updatedAt: new Date(),
}

describe('serializeUser', () => {
  it('公開してよい6フィールドだけを返す', () => {
    expect(serializeUser(rawUser)).toEqual({
      id: 'u1',
      username: 'taro',
      displayName: 'テスト太郎',
      avatar: 'https://example.test/a.png',
      server: 'example.social',
      platform: 'mastodon',
    })
  })

  // ここが崩れると、公開ページにアクセストークンや IP が載る。
  it.each(FORBIDDEN_USER_FIELDS)('機密フィールド %s を含まない', (field) => {
    expect(serializeUser(rawUser)).not.toHaveProperty(field)
    expect(JSON.stringify(serializeUser(rawUser))).not.toContain('SECRET')
  })

  it('isAdmin を含まない（一般向けDTO）', () => {
    expect(serializeUser(rawUser)).not.toHaveProperty('isAdmin')
  })
})

describe('serializeUserProfile', () => {
  it('本人が書いたプロフィールと、6列の user を返す', () => {
    expect(serializeUserProfile(rawUser)).toEqual({
      user: serializeUser(rawUser),
      joinedAt: '2026-01-01T00:00:00.000Z',
      bio: 'よろしく',
      socialAccounts: [{ platform: 'misskey', username: 'taro', server: 'misskey.io' }],
      homepageUrls: ['https://example.test'],
    })
  })

  it.each(FORBIDDEN_USER_FIELDS)('機密フィールド %s を含まない', (field) => {
    const dto = serializeUserProfile(rawUser)
    expect(dto).not.toHaveProperty(field)
    expect(dto.user).not.toHaveProperty(field)
  })

  /*
    公開プロフィールにメールアドレスが載らないことを、文字列としても見る。
    入れ子のどこかに混ざっても気づけるようにするため。
  */
  it('メールアドレスがどこにも現れない', () => {
    expect(JSON.stringify(serializeUserProfile(rawUser))).not.toContain('taro@example.test')
  })

  it('未入力なら空で返す', () => {
    const dto = serializeUserProfile({
      ...rawUser,
      bio: null,
      socialAccounts: null,
      homepageUrls: null,
    })
    expect(dto.bio).toBeNull()
    expect(dto.socialAccounts).toEqual([])
    expect(dto.homepageUrls).toEqual([])
  })

  /*
    列の中身は JSON を入れた Text。手で直された行や、上限を変える前の行が
    混ざりうる。**読めない行でページを 500 にしない。**
  */
  it('壊れた JSON でも落ちず、空で返す', () => {
    const dto = serializeUserProfile({
      ...rawUser,
      socialAccounts: '{broken',
      homepageUrls: 'null',
    })
    expect(dto.socialAccounts).toEqual([])
    expect(dto.homepageUrls).toEqual([])
  })

  it('形の合わない要素だけを落とす', () => {
    const dto = serializeUserProfile({
      ...rawUser,
      socialAccounts: '[{"platform":"misskey","username":"taro"},{"platform":1},null,"x"]',
      homepageUrls: '["https://example.test", 42, null]',
    })
    expect(dto.socialAccounts).toEqual([
      { platform: 'misskey', username: 'taro', server: '' },
    ])
    expect(dto.homepageUrls).toEqual(['https://example.test'])
  })
})
