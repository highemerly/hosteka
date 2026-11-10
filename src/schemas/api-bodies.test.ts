import { describe, expect, it } from 'vitest'

import { registerHostedBody, registerWithServerBody } from './auth'
import { eventPostImmediateBody, preEventPostScheduledBody } from './contact'
import { participateBody } from './event'
import { VALIDATION_LIMITS } from './limits'
import { preEventPayloadSchema, respondPreEventBody } from './pre-event'
import { HOMEPAGE_URL_MAX, SOCIAL_ACCOUNT_MAX, updateProfileBody } from './user'

/**
 * API の本文スキーマ。
 *
 * **ここは `src/lib/validation.ts`（手書きの検証、465行）の置き換え先。**
 * 旧実装は全16本のルートで本文を `z.record(z.string(), z.unknown())` として
 * 素通しし、中身をルートの中で手で確かめていた。契約書にも「任意の
 * オブジェクト」としか書けず、検証の有無がルートごとにばらついていた。
 *
 * 旧 `validation.test.ts` が見ていた規則のうち、**いまも生きているもの**を
 * ここへ移してある（使い手のいなかった `validateOrgData` や `validateUrl` は
 * 移さず、そのまま消した）。
 */

const base = {
  title: 'テスト日程調整',
  hashtags: [],
  dateOptions: [{ startDate: '2026-09-20T10:00:00.000Z', endDate: null }],
  registrationDeadline: null,
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: [],
  allowAutoRegistration: false,
  isPublic: true,
  isHighlighted: false,
}

describe('OAuth を始める本文', () => {
  /** 画面が同意を取るのは利用規約だけ。文言もそれに合わせる */
  it('同意が無ければ通さない', () => {
    const result = registerHostedBody.safeParse({ callbackUrl: '/' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('利用規約への同意が必要です')
  })

  it('同意を false で送っても通さない', () => {
    expect(registerHostedBody.safeParse({ termsAccepted: false }).success).toBe(false)
  })

  it('ホスト名の形を見る（`localhost` や空は通さない）', () => {
    for (const server of ['', 'localhost', 'not a host']) {
      expect(
        registerWithServerBody.safeParse({ server, termsAccepted: true }).success,
        server
      ).toBe(false)
    }
    expect(
      registerWithServerBody.safeParse({ server: 'mastodon.social', termsAccepted: true }).success
    ).toBe(true)
  })
})

describe('連絡（SNS への投稿）の本文', () => {
  it('宛先が空なら通さない', () => {
    const result = eventPostImmediateBody.safeParse({
      eventId: 'c'.repeat(25),
      message: 'こんにちは',
      participantIds: [],
    })
    expect(result.success).toBe(false)
  })

  it('公開範囲は既定で public。**値の集合は投稿先が決める**ので enum にしない', () => {
    const result = eventPostImmediateBody.parse({
      eventId: 'c'.repeat(25),
      message: 'こんにちは',
      participantIds: ['user_1'],
    })
    expect(result.visibility).toBe('public')

    // Misskey の `followers` も Mastodon の `private` も、どちらも通る
    for (const visibility of ['followers', 'private', 'home']) {
      expect(
        eventPostImmediateBody.safeParse({
          eventId: 'c'.repeat(25),
          message: 'a',
          participantIds: ['u'],
          visibility,
        }).success
      ).toBe(true)
    }
  })

  it('予約の日時は、日付として読めない文字列を通さない', () => {
    expect(
      preEventPostScheduledBody.safeParse({ message: 'a', scheduledFor: 'あした' }).success
    ).toBe(false)
    expect(
      preEventPostScheduledBody.safeParse({ message: 'a', scheduledFor: '2026-09-20T10:00:00Z' })
        .success
    ).toBe(true)
  })
})

describe('参加登録の本文', () => {
  it('コメントの上限は旧実装と同じ', () => {
    const ok = participateBody.safeParse({
      comment: 'あ'.repeat(VALIDATION_LIMITS.PARTICIPANT_COMMENT),
    })
    const ng = participateBody.safeParse({
      comment: 'あ'.repeat(VALIDATION_LIMITS.PARTICIPANT_COMMENT + 1),
    })
    expect(ok.success).toBe(true)
    expect(ng.success).toBe(false)
    expect(ng.error?.issues[0]?.message).toBe(
      `コメントは${VALIDATION_LIMITS.PARTICIPANT_COMMENT}文字以内で入力してください`
    )
  })

  it('状態を送らなければ「参加」。旧実装の既定と同じ', () => {
    expect(participateBody.parse({}).status).toBe('attending')
    expect(participateBody.parse({}).selectedGroupOptions).toEqual({})
  })
})

describe('日程調整の回答の本文', () => {
  it('○△× 以外の状態は通さない', () => {
    const result = respondPreEventBody.safeParse({
      responses: [{ dateOptionId: 'd1', status: 'perhaps' }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('無効な参加状況です')
  })

  it('回答が空なら通さない', () => {
    expect(respondPreEventBody.safeParse({ responses: [] }).success).toBe(false)
  })
})

describe('日程調整の保存の本文', () => {
  it('候補日が無ければ通さない', () => {
    const result = preEventPayloadSchema.safeParse({ ...base, dateOptions: [] })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('候補日時は最低1つ必要です')
  })

  it('年の範囲は2000〜2999。旧 validateDateRange と同じ規則', () => {
    const tooOld = preEventPayloadSchema.safeParse({
      ...base,
      dateOptions: [{ startDate: '1999-12-31T00:00:00.000Z', endDate: null }],
    })
    expect(tooOld.success).toBe(false)
    expect(tooOld.error?.issues[0]?.message).toBe('開始日は2000年〜2999年の範囲で入力してください')

    expect(preEventPayloadSchema.safeParse(base).success).toBe(true)
  })

  it('プラットフォームを1つも選んでいなければ通さない', () => {
    const result = preEventPayloadSchema.safeParse({
      ...base,
      isAllowedForFediverse: false,
      isAllowedForDiscord: false,
      isAllowedForTwitter: false,
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      '少なくとも1つのプラットフォームを選択してください'
    )
  })

  it('タイトルの上限は旧実装と同じ', () => {
    const result = preEventPayloadSchema.safeParse({
      ...base,
      title: 'あ'.repeat(VALIDATION_LIMITS.EVENT_TITLE + 1),
    })
    expect(result.success).toBe(false)
  })
})

describe('プロフィールを更新する本文', () => {
  const full = {
    bio: 'こんにちは',
    email: 'alice@example.com',
    socialAccounts: [{ platform: 'mastodon', username: 'alice', server: 'mastodon.social' }],
    homepageUrls: ['https://example.com'],
  }

  it('全部埋まっていれば通る', () => {
    expect(updateProfileBody.safeParse(full).success).toBe(true)
  })

  it('空欄は null に畳む', () => {
    const result = updateProfileBody.parse({
      bio: '',
      email: '',
      socialAccounts: [],
      homepageUrls: [],
    })
    expect(result.bio).toBeNull()
    expect(result.email).toBeNull()
  })

  /*
    **キーを落として送れないこと。** PUT は全体の置き換えなので、
    落とせるようにすると「運ぶのを忘れた項目が黙って消える」。
  */
  it('項目を落として送ると弾く。文言は日本語', () => {
    const social = updateProfileBody.safeParse({ ...full, socialAccounts: undefined })
    expect(social.success).toBe(false)
    expect(social.error?.issues[0]?.message).toBe('SNSのアカウントを指定してください')

    const urls = updateProfileBody.safeParse({ ...full, homepageUrls: undefined })
    expect(urls.success).toBe(false)
    expect(urls.error?.issues[0]?.message).toBe('ホームページを指定してください')
  })

  it('SNSの上限を超えると弾く', () => {
    const rows = Array.from({ length: SOCIAL_ACCOUNT_MAX + 1 }, () => ({
      platform: 'misskey',
      username: 'alice',
      server: 'misskey.io',
    }))
    const result = updateProfileBody.safeParse({ ...full, socialAccounts: rows })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      `SNSのアカウントは${SOCIAL_ACCOUNT_MAX}件まで登録できます`
    )
  })

  it('同じプラットフォーム・同じIDの重複は通す', () => {
    const row = { platform: 'mastodon', username: 'alice', server: 'mastodon.social' }
    expect(updateProfileBody.safeParse({ ...full, socialAccounts: [row, row] }).success).toBe(true)
  })

  it('ホームページの上限を超えると弾く', () => {
    const urls = Array.from({ length: HOMEPAGE_URL_MAX + 1 }, () => 'https://example.com')
    const result = updateProfileBody.safeParse({ ...full, homepageUrls: urls })
    expect(result.success).toBe(false)
  })

  it('https でないホームページを弾く', () => {
    expect(
      updateProfileBody.safeParse({ ...full, homepageUrls: ['example.com'] }).success
    ).toBe(false)
  })

  it('形になっていないメールアドレスを弾く', () => {
    const result = updateProfileBody.safeParse({ ...full, email: 'alice' })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('メールアドレスは正しい形式で入力してください')
  })

  it('メールアドレスの大文字を畳まない。ローカル部は case-sensitive', () => {
    const result = updateProfileBody.parse({ ...full, email: 'Alice@Example.com' })
    expect(result.email).toBe('Alice@Example.com')
  })

  it('SNSのIDに付いた @ を落とす', () => {
    const result = updateProfileBody.parse({
      ...full,
      socialAccounts: [{ platform: 'misskey', username: '@alice', server: 'misskey.io' }],
    })
    expect(result.socialAccounts[0].username).toBe('alice')
  })

  /*
    X と Discord は画面にサーバー欄を出さないが、本文では固定値を要求する。
    users.server（x.com / discord.com 固定）と形をそろえるため。
  */
  it('X のサーバーが x.com でなければ弾く', () => {
    const result = updateProfileBody.safeParse({
      ...full,
      socialAccounts: [{ platform: 'twitter', username: 'alice', server: 'twitter.com' }],
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Xのサーバーは x.com です')
  })

  it('Discord のサーバーが discord.com でなければ弾く', () => {
    expect(
      updateProfileBody.safeParse({
        ...full,
        socialAccounts: [{ platform: 'discord', username: 'alice', server: '' }],
      }).success
    ).toBe(false)
  })

  it('Fediverse のサーバーはホスト名の形を求める', () => {
    expect(
      updateProfileBody.safeParse({
        ...full,
        socialAccounts: [{ platform: 'mastodon', username: 'alice', server: 'localhost' }],
      }).success
    ).toBe(false)
  })

  it('ログインに使えないプラットフォームは選べない', () => {
    expect(
      updateProfileBody.safeParse({
        ...full,
        socialAccounts: [{ platform: 'bluesky', username: 'alice', server: 'bsky.app' }],
      }).success
    ).toBe(false)
  })
})
