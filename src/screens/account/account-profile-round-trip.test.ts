import { describe, expect, it } from 'vitest'

import type { AccountProfileDto } from '@/app/api/v1/account/profile/route'
import { updateProfileBody } from '@/schemas/user'

import {
  EMPTY_ACCOUNT_PROFILE_FORM,
  toAccountProfileFormValues,
  toUpdateProfileBody,
  withPlatform,
  type AccountProfileFormValues,
} from './account-profile-form-values'

/**
 * 設定画面を開いて保存しただけで値が消えないこと。
 *
 * **この形の事故が繰り返し起きている**（イベント・日程調整・グループ）。
 * サーバーは受け取った本文で全体を置き換えるので、`DTO → フォーム → 本文` の
 * どこか1箇所で項目が抜けると、開いて保存し直すだけでその項目が消える。
 * 画面は正常に見えるので、気づくのは後日になる。
 *
 * ここでとくに危ないのは **SNS の行**。プラットフォームによって画面に出る
 * 欄が違う（X と Discord はサーバー欄を出さない）ので、写し取りを
 * 間違えると「開いて保存したら X のアカウントだけ消える」が起きる。
 */

/** 全部の欄が埋まっているプロフィール。**空にしない** — null は往復しても null で通る */
const FULL: AccountProfileDto = {
  bio: '### はじめまして\n毎月オフ会をしています。',
  email: 'taro@example.com',
  socialAccounts: [
    { platform: 'mastodon', username: 'taro', server: 'mastodon.social' },
    { platform: 'misskey', username: 'taro', server: 'misskey.io' },
    { platform: 'pleroma', username: 'taro', server: 'pleroma.example' },
    { platform: 'twitter', username: 'taro', server: 'x.com' },
    { platform: 'discord', username: 'taro', server: 'discord.com' },
  ],
  homepageUrls: ['https://example.com/a', 'https://example.com/b'],
}

/**
 * フォームの項目の分類。
 *
 * **`Record<keyof AccountProfileFormValues, …>` にしてある。** 欄が増えると
 * ここが型エラーになり、「運ぶ」か「編集の対象外（理由付き）」かを
 * 決めるまで typecheck が通らない。
 *
 * **表示テーマはここに現れない。** あれは端末（localStorage）に持つもので、
 * DTO にも本文にも無い。フォームの値にすると、保存ボタンを押すまで
 * 効かないのに画面は既に変わっている（`useTheme` が即時に反映する）
 * という食い違いになる。
 */
const CLASSIFIED: Record<keyof AccountProfileFormValues, 'carried' | string> = {
  bio: 'carried',
  email: 'carried',
  socialAccounts: 'carried',
  homepageUrls: 'carried',
}

/** 開いて保存しただけ、と同じ経路を通す */
function reopenAndSave(profile: AccountProfileDto) {
  return updateProfileBody.parse(toUpdateProfileBody(toAccountProfileFormValues(profile)))
}

describe('設定画面を開いて保存しただけで値が消えない', () => {
  it('分類がフォームの全項目を覆っている', () => {
    expect(Object.keys(CLASSIFIED).sort()).toEqual(
      Object.keys(EMPTY_ACCOUNT_PROFILE_FORM).sort()
    )
  })

  it('全部の項目がそのまま残る', () => {
    expect(reopenAndSave(FULL)).toEqual({
      bio: FULL.bio,
      email: FULL.email,
      socialAccounts: FULL.socialAccounts,
      homepageUrls: FULL.homepageUrls,
    })
  })

  /**
   * **並び順が保存されること。** 配列で持っているので順序が値そのもの。
   * 畳んだり並べ替えたりすると、開くたびに順番が変わる。
   */
  it('SNSの並び順が変わらない', () => {
    expect(reopenAndSave(FULL).socialAccounts.map((a) => a.platform)).toEqual([
      'mastodon',
      'misskey',
      'pleroma',
      'twitter',
      'discord',
    ])
  })

  it('ホームページの並び順が変わらない', () => {
    expect(reopenAndSave(FULL).homepageUrls).toEqual(FULL.homepageUrls)
  })

  it('2回開いて保存しても、1回目と同じものが出る', () => {
    expect(reopenAndSave(FULL)).toEqual(reopenAndSave(FULL))
  })

  it('空の項目は null で往復する（空文字にしない）', () => {
    const body = reopenAndSave({ ...FULL, bio: null, email: null })
    expect(body.bio).toBeNull()
    expect(body.email).toBeNull()
  })

  it('何も登録していなくても通る', () => {
    expect(
      reopenAndSave({ bio: null, email: null, socialAccounts: [], homepageUrls: [] })
    ).toEqual({ bio: null, email: null, socialAccounts: [], homepageUrls: [] })
  })

  /*
    同じプラットフォーム・同じIDの重複を許す仕様。畳むと、開いて保存する
    だけで片方が消える。
  */
  it('重複した行を畳まない', () => {
    const row = { platform: 'mastodon' as const, username: 'taro', server: 'mastodon.social' }
    const body = reopenAndSave({ ...FULL, socialAccounts: [row, row] })
    expect(body.socialAccounts).toHaveLength(2)
  })

  /*
    保存済みの行に、もう選べないプラットフォームが混ざることがありうる
    （選択肢を減らしたとき）。画面に出せないものを運ぼうとすると、
    保存のたびに 400 になって何も直せなくなる。
  */
  it('知らないプラットフォームの行は落とす', () => {
    const values = toAccountProfileFormValues({
      ...FULL,
      socialAccounts: [
        { platform: 'bluesky', username: 'taro', server: 'bsky.app' },
        { platform: 'mastodon', username: 'taro', server: 'mastodon.social' },
      ],
    })
    expect(values.socialAccounts).toHaveLength(1)
    expect(values.socialAccounts[0].platform).toBe('mastodon')
  })
})

describe('本文を作るとき', () => {
  const values = toAccountProfileFormValues(FULL)

  it('何も書いていないSNSの行は送らない', () => {
    const edited: AccountProfileFormValues = {
      ...values,
      socialAccounts: [...values.socialAccounts.slice(0, 1), { platform: 'misskey', username: '  ', server: 'misskey.io' }],
    }
    expect(toUpdateProfileBody(edited).socialAccounts).toHaveLength(1)
  })

  it('空のホームページの行は送らない', () => {
    expect(
      toUpdateProfileBody({ ...values, homepageUrls: ['https://example.com/a', '  '] })
        .homepageUrls
    ).toEqual(['https://example.com/a'])
  })

  it('貼り付けで付いてきた @ と前後の空白を落とす', () => {
    const edited: AccountProfileFormValues = {
      ...values,
      socialAccounts: [{ platform: 'mastodon', username: ' @taro ', server: ' mastodon.social ' }],
    }
    expect(toUpdateProfileBody(edited).socialAccounts[0]).toEqual({
      platform: 'mastodon',
      username: 'taro',
      server: 'mastodon.social',
    })
  })

  /*
    X と Discord は画面にサーバー欄を出さない。**本文では固定値を埋める** —
    users.server（x.com / discord.com 固定）と形をそろえるため。
  */
  it('サーバー欄の無いプラットフォームには固定値を埋める', () => {
    const edited: AccountProfileFormValues = {
      ...values,
      socialAccounts: [
        { platform: 'twitter', username: 'taro', server: '' },
        { platform: 'discord', username: 'taro', server: 'なにか' },
      ],
    }
    const body = updateProfileBody.parse(toUpdateProfileBody(edited))
    expect(body.socialAccounts).toEqual([
      { platform: 'twitter', username: 'taro', server: 'x.com' },
      { platform: 'discord', username: 'taro', server: 'discord.com' },
    ])
  })
})

describe('withPlatform', () => {
  /*
    Fediverse から X へ変えたときに `mastodon.social` が残ると、画面には
    欄が無いのに不正な値を送ることになる（400 で、どこが悪いか画面に出ない）。
  */
  it('サーバー欄の無いプラットフォームへ変えると固定値が入る', () => {
    expect(
      withPlatform({ platform: 'mastodon', username: 'taro', server: 'mastodon.social' }, 'twitter')
    ).toEqual({ platform: 'twitter', username: 'taro', server: 'x.com' })
  })

  it('固定値から Fediverse へ戻すとサーバーは空になる', () => {
    expect(
      withPlatform({ platform: 'twitter', username: 'taro', server: 'x.com' }, 'mastodon')
    ).toEqual({ platform: 'mastodon', username: 'taro', server: '' })
  })

  it('Fediverse どうしの入れ替えでは入力を消さない', () => {
    expect(
      withPlatform({ platform: 'mastodon', username: 'taro', server: 'mastodon.social' }, 'misskey')
    ).toEqual({ platform: 'misskey', username: 'taro', server: 'mastodon.social' })
  })
})
