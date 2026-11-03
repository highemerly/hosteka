import { profileUrl } from '@/lib/profile-url'
import type { UserSocialAccountDto } from '@/server/serializers/user'

/**
 * ユーザーページに並べる SNS のアカウント。
 *
 * **ログインに使っているアカウントを先頭に置く。** あれも「この人に
 * 連絡できる場所」の1つで、本人が書いた追加分と別扱いにする理由がない。
 * 並べないと、Hosteka で見えている名前と Fediverse 上のアカウントが
 * どう対応するのかがページから読めなくなる。
 *
 * **重複は消さない。** 同じプラットフォームを2つ並べるのも、ログインに
 * 使っているアカウントをもう一度書くのも、本人がそうしたいなら通す
 * （`src/schemas/user.ts` も弾いていない）。
 */
export type ProfileSocialAccount = UserSocialAccountDto & {
  /** ログインに使っているアカウントか。印を付けるのは画面の仕事 */
  isLogin: boolean
  /** 開けるなら URL。Discord は開けないので null（`src/lib/profile-url.ts`） */
  url: string | null
}

export function profileSocialAccounts(
  login: { platform: string; username: string; server: string },
  added: UserSocialAccountDto[]
): ProfileSocialAccount[] {
  return [
    { ...login, isLogin: true },
    ...added.map((account) => ({ ...account, isLogin: false })),
  ].map((account) => ({ ...account, url: profileUrl(account) }))
}
