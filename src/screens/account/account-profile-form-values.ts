import { FIXED_SOCIAL_SERVER, type SocialPlatform, type UpdateProfileBody } from '@/schemas/user'
import type { AccountProfileDto } from '@/app/api/v1/account/profile/route'

/**
 * 保存済みのプロフィールを、フォームの入力欄の形へ写す。
 *
 * **画面の中に書かない。** サーバーは受け取った本文で全体を置き換えるので、
 * ここが1つでも欠けると、開いて保存した瞬間にその項目が消える。画面の
 * `reset()` の中にあると、抜けても画面は正常に見えるし、テストからも触れない。
 *
 * 往復（開いて保存しただけで値が変わらないこと）は
 * `account-profile-round-trip.test.ts` が固定している。
 */

export type SocialAccountValue = {
  platform: SocialPlatform
  username: string
  server: string
}

export type AccountProfileFormValues = {
  bio: string
  email: string
  socialAccounts: SocialAccountValue[]
  homepageUrls: string[]
}

export const EMPTY_ACCOUNT_PROFILE_FORM: AccountProfileFormValues = {
  bio: '',
  email: '',
  socialAccounts: [],
  homepageUrls: [],
}

const PLATFORMS: readonly SocialPlatform[] = [
  'mastodon',
  'misskey',
  'pleroma',
  'twitter',
  'discord',
]

function isPlatform(value: string): value is SocialPlatform {
  return (PLATFORMS as readonly string[]).includes(value)
}

/** 新しい行の既定。ログインの選択肢で最も多いものにそろえる */
export function emptySocialAccount(): SocialAccountValue {
  return { platform: 'mastodon', username: '', server: '' }
}

/**
 * プラットフォームを変えたときの行。
 *
 * **サーバーも一緒に書き換える。** Fediverse から X へ変えたときに
 * `mastodon.social` が残ると、画面には欄が無いのに不正な値を送ることになる
 * （`userSocialAccount` が固定値を求めるので 400）。
 */
export function withPlatform(
  row: SocialAccountValue,
  platform: SocialPlatform
): SocialAccountValue {
  const fixed = FIXED_SOCIAL_SERVER[platform]
  if (fixed) return { ...row, platform, server: fixed }
  // 固定サーバーから Fediverse へ戻すときは、入力してもらうので空にする
  return { ...row, platform, server: FIXED_SOCIAL_SERVER[row.platform] ? '' : row.server }
}

export function toAccountProfileFormValues(
  profile: AccountProfileDto
): AccountProfileFormValues {
  return {
    // null は空欄にする。**戻すときに空欄を null へ返すこと**
    bio: profile.bio ?? '',
    email: profile.email ?? '',
    socialAccounts: profile.socialAccounts.flatMap((account) =>
      // 保存済みの行に知らないプラットフォームが混ざっていたら落とす
      isPlatform(account.platform)
        ? [{ platform: account.platform, username: account.username, server: account.server }]
        : []
    ),
    homepageUrls: [...profile.homepageUrls],
  }
}

/**
 * 更新の本文（全体の置き換え）。
 *
 * **空の行は落とす。** 「追加」を押したまま何も書かずに保存する人がいる。
 * 送ると必須のエラーで弾かれるだけなので、ここで落とす。
 */
export function toUpdateProfileBody(values: AccountProfileFormValues): UpdateProfileBody {
  return {
    bio: values.bio.trim() || null,
    email: values.email.trim() || null,
    socialAccounts: values.socialAccounts
      .filter((account) => account.username.trim() !== '')
      .map((account) => ({
        platform: account.platform,
        username: account.username.trim().replace(/^@/, ''),
        // 画面に欄が無いプラットフォームは、ここで固定値を埋める
        server: (FIXED_SOCIAL_SERVER[account.platform] ?? account.server).trim(),
      })),
    homepageUrls: values.homepageUrls.map((url) => url.trim()).filter((url) => url !== ''),
  }
}
