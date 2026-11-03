import { z } from 'zod'

import { optionalEmail, optionalString, paginationQuery, requiredString, requiredUrl } from './common'
import { VALIDATION_LIMITS } from './limits'

/**
 * 自分のプロフィール。
 *
 * ユーザーが自分で書く唯一の入力。`users` のほかの列はログインのたびに
 * 相手のサーバーから同期される値で、画面から編集するものは無い。
 *
 * isomorphic（`prisma` も `server-only` も import しない）。
 */

export const SOCIAL_ACCOUNT_MAX = 5
export const HOMEPAGE_URL_MAX = 2

/**
 * 他のSNSのプラットフォーム。
 *
 * **ログインに使える集合と同じ**（`src/lib/oauth-scopes.ts` の `OAuthPlatform`）。
 * ここだけ増やすと、選べるのにアイコンもリンクの作り方も無い選択肢ができる。
 */
export const socialPlatform = z.enum(['mastodon', 'misskey', 'pleroma', 'twitter', 'discord'], {
  error: 'プラットフォームを選んでください',
})

export type SocialPlatform = z.infer<typeof socialPlatform>

/**
 * サーバーを持たないプラットフォームの、固定のホスト名。
 *
 * `users.server` がこの値で埋まっている（X のコールバックは `x.com`、
 * Discord は `discord.com` を書く）。**追加したアカウントも同じ形にそろえる** —
 * 空で持つと、表示側が「server がある場合／ない場合」の2通りを相手にすることになる。
 */
export const FIXED_SOCIAL_SERVER: Partial<Record<SocialPlatform, string>> = {
  twitter: 'x.com',
  discord: 'discord.com',
}

/** ホスト名として受け付ける形。ログイン画面の `isValidServerHost` と同じ */
const SERVER_PATTERN = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/

export const userSocialAccount = z
  .object({
    platform: socialPlatform,
    // `@alice` と貼られることが多い。落としてから持つ
    username: requiredString('ユーザー名', VALIDATION_LIMITS.USER_SOCIAL_USERNAME).transform((v) =>
      v.replace(/^@/, '')
    ),
    server: requiredString('サーバー', VALIDATION_LIMITS.USER_SOCIAL_SERVER),
  })
  .superRefine((value, ctx) => {
    const fixed = FIXED_SOCIAL_SERVER[value.platform]
    if (fixed) {
      if (value.server !== fixed) {
        ctx.addIssue({
          code: 'custom',
          message: `${value.platform === 'twitter' ? 'X' : 'Discord'}のサーバーは ${fixed} です`,
          path: ['server'],
        })
      }
      return
    }
    if (!SERVER_PATTERN.test(value.server)) {
      ctx.addIssue({
        code: 'custom',
        message: 'サーバーはホスト名で入力してください（例: mastodon.social）',
        path: ['server'],
      })
    }
  })

export type UserSocialAccountInput = z.infer<typeof userSocialAccount>

/**
 * プロフィールの更新。
 *
 * **どのキーも `.optional()` にしない。** `updateOrgBody` は「送った項目だけ
 * 更新する」部分更新だが、こちらは PUT（全体の置き換え）なので、キーを
 * 1つ落として送るとその項目は黙って消える。必須にしておけば、
 * `toUpdateProfileBody` が項目を落とした瞬間に 400 が出て気づける。
 *
 * **表示テーマはここに無い。** あれは端末（localStorage）に持つもので、
 * DB に置くと `Vary: Cookie` かユーザー別 HTML が要り、全ページを
 * CDN キャッシュ可能にする方針が壊れる（`src/lib/theme.ts`）。
 */
export const updateProfileBody = z.object({
  bio: optionalString('自己紹介', VALIDATION_LIMITS.USER_BIO),
  email: optionalEmail('メールアドレス', VALIDATION_LIMITS.USER_EMAIL),
  /*
    **重複を弾かない。** 同じプラットフォームを2つ並べるのも、ログインに
    使っているアカウントをもう一度書くのも、本人がそうしたいなら通す。
  */
  socialAccounts: z
    // 落として送られたときの文言。Zod の既定は英語で、画面にそのまま出る
    .array(userSocialAccount, { error: 'SNSのアカウントを指定してください' })
    .max(SOCIAL_ACCOUNT_MAX, `SNSのアカウントは${SOCIAL_ACCOUNT_MAX}件まで登録できます`),
  homepageUrls: z
    .array(requiredUrl('ホームページ', VALIDATION_LIMITS.USER_HOMEPAGE_URL), {
      error: 'ホームページを指定してください',
    })
    .max(HOMEPAGE_URL_MAX, `ホームページは${HOMEPAGE_URL_MAX}件まで登録できます`),
})

export type UpdateProfileBody = z.infer<typeof updateProfileBody>

/** ユーザーページの URL に出るハンドル。解釈は `src/lib/user-handle.ts` */
export const userHandleParam = z.object({
  handle: z.string().trim().min(1, 'ユーザーを指定してください').max(400),
})

/**
 * ユーザーのページの一覧に何を並べるか。
 *
 * `all` は所属グループのものを含む。`personal` はグループ名義のものを除く
 * （`src/server/queries/profile-lists.ts`）。
 */
export const profileListScope = z.enum(['all', 'personal'])

export type ProfileListScope = z.infer<typeof profileListScope>

export const userListQuery = paginationQuery.extend({
  scope: profileListScope.default('all'),
})
