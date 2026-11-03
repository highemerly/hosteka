import { describe, expect, it } from 'vitest'

import type { Viewer } from '@/lib/viewer'

import { defaultPlatforms, isCustomizedPlatforms, viewerPlatformField } from './default-platforms'

/**
 * 新しいイベントの既定のプラットフォーム。
 *
 * **主催者が自分のイベントに参加登録できない既定を作らない。**
 * 以前は誰が作っても Fediverse 固定で、Discord や X でログインした
 * 主催者は既定のまま作ると自分が弾かれた。画面の注釈は
 * 「既定では主催者と同じプラットフォームのみ」と書いてあったので、
 * 文言だけが正しい状態だった。
 */
const viewer = (platform: string): Viewer => ({
  id: 'u1',
  name: '主催者',
  avatar: null,
  isAdmin: false,
  username: 'host',
  server: 'handon.club',
  platform,
  v: 1,
})

const ONLY_FEDIVERSE = {
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
}

describe('defaultPlatforms', () => {
  it.each(['mastodon', 'misskey', 'pleroma'])('%s の主催者は Fediverse', (platform) => {
    expect(defaultPlatforms(viewer(platform))).toEqual(ONLY_FEDIVERSE)
  })

  it('Discord の主催者は Discord', () => {
    expect(defaultPlatforms(viewer('discord'))).toEqual({
      isAllowedForFediverse: false,
      isAllowedForDiscord: true,
      isAllowedForTwitter: false,
    })
  })

  it('X の主催者は X', () => {
    expect(defaultPlatforms(viewer('twitter'))).toEqual({
      isAllowedForFediverse: false,
      isAllowedForDiscord: false,
      isAllowedForTwitter: true,
    })
  })

  it('未ログインは Fediverse に倒す', () => {
    expect(defaultPlatforms(null)).toEqual(ONLY_FEDIVERSE)
  })

  it('知らないプラットフォームでも空にはしない', () => {
    // 1つも選ばれていない状態で始めると、「1つ以上選んでください」で
    // 止まったまま何を直せばよいのか分からない
    const result = defaultPlatforms(viewer('bluesky'))
    expect(Object.values(result).some(Boolean)).toBe(true)
  })

  it('必ず1つだけ選ぶ（既定から広げるのは主催者の判断）', () => {
    for (const platform of ['mastodon', 'discord', 'twitter', 'bluesky']) {
      const result = defaultPlatforms(viewer(platform))
      expect(Object.values(result).filter(Boolean)).toHaveLength(1)
    }
  })
})

/**
 * 画面はこの値で「外せないトグル」を決める。
 *
 * **既定に入る欄と、外せない欄は必ず同じでなければならない。**
 * ずれると「既定で入っているのに外せる」（外すと自分が参加できなくなる）か、
 * 「外せないのに既定では入らない」（1つも選べない状態で止まる）になる。
 */
describe('viewerPlatformField', () => {
  it.each(['mastodon', 'misskey', 'pleroma'])('%s は Fediverse の欄', (platform) => {
    expect(viewerPlatformField(viewer(platform))).toBe('isAllowedForFediverse')
  })

  it('Discord は Discord の欄', () => {
    expect(viewerPlatformField(viewer('discord'))).toBe('isAllowedForDiscord')
  })

  it('X は X の欄', () => {
    expect(viewerPlatformField(viewer('twitter'))).toBe('isAllowedForTwitter')
  })

  it('未ログイン・知らないプラットフォームでは施錠しない', () => {
    // 既定は Fediverse に倒すが、**それは「その人の場所」ではない**。
    // 施錠すると、未ログインで作った人が Fediverse を外せなくなる
    expect(viewerPlatformField(null)).toBeNull()
    expect(viewerPlatformField(viewer('bluesky'))).toBeNull()
  })

  it('施錠する欄は、その人の既定で必ずオンになっている', () => {
    for (const platform of ['mastodon', 'misskey', 'pleroma', 'discord', 'twitter']) {
      const v = viewer(platform)
      const field = viewerPlatformField(v)
      expect(field).not.toBeNull()
      expect(defaultPlatforms(v)[field!]).toBe(true)
    }
  })
})

/**
 * 「カスタマイズする」のトグルを開いておくか。
 *
 * **既定から外れた値を畳んで隠さない。** 編集で開いたとき、効いている
 * 制限がトグルの裏に隠れると、主催者はそれを確かめる手がかりを失う。
 */
describe('isCustomizedPlatforms', () => {
  const values = (overrides: Partial<Parameters<typeof isCustomizedPlatforms>[0]> = {}) => ({
    ...ONLY_FEDIVERSE,
    allowedFediverseServers: [],
    ...overrides,
  })

  it('その人の既定のままなら、カスタマイズしていない', () => {
    expect(isCustomizedPlatforms(values(), viewer('mastodon'))).toBe(false)
    expect(
      isCustomizedPlatforms(
        values({ isAllowedForFediverse: false, isAllowedForDiscord: true }),
        viewer('discord')
      )
    ).toBe(false)
  })

  it('プラットフォームを足していれば、カスタマイズしている', () => {
    expect(isCustomizedPlatforms(values({ isAllowedForDiscord: true }), viewer('mastodon'))).toBe(
      true
    )
  })

  it('既定は閲覧者で決まる。他のプラットフォームの主催者が作ったものは開く', () => {
    expect(isCustomizedPlatforms(values(), viewer('discord'))).toBe(true)
  })

  it('サーバーを絞っていれば、プラットフォームが既定でもカスタマイズしている', () => {
    expect(
      isCustomizedPlatforms(values({ allowedFediverseServers: ['handon.club'] }), viewer('mastodon'))
    ).toBe(true)
  })
})
