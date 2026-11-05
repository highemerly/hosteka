import 'server-only'

import { prisma } from '@/lib/prisma'

/**
 * X / Discord でログインしてきた人を、**不変のIDで**アカウントに結びつける。
 *
 * あの2つはユーザー名を変えられ、手放した名前を他人が取れる。
 * `username@server` で照合すると、Alice が X のハンドルを foo から bar に
 * 変えたあと、foo を取った Bob がログインすると **Alice の Hosteka
 * アカウントにそのまま入れる**（主催イベント・参加者の連絡先・グループの
 * 管理権限まで）。Alice のほうは bar で入ると空の新しいアカウントになる。
 *
 * 照合の順番:
 *
 * 1. **IDで見つかれば、それが本人の行。** 名前が変わっていれば書き換える
 * 2. 名前で見つかった行がIDで見つかった行と違えば、その名前は前の持ち主の
 *    もの。行の名前を退避名に変えて空け、IDで見つかった行か新しい行を使う
 *
 * **名前だけで行を引き継がない。** IDを持たない行（この列を足す前に入った人）も
 * 同じで、名前が同じでも本人とは限らない。そうした人が戻ってくると、
 * 新しい行になる。
 *
 * Mastodon / Misskey / Pleroma はユーザー名を変えられないので、ここを通さない。
 */

export type HostedPlatform = { platform: 'twitter'; server: 'x.com' } | { platform: 'discord'; server: 'discord.com' }

export type HostedUserInput = HostedPlatform & {
  /** 相手のプラットフォームでの不変のID（X の `data.id`、Discord の `id`） */
  platformUserId: string
  /** `loginIdentity` を通した後のユーザー名 */
  username: string
  displayName: string
  avatar: string | null
}

/**
 * X と Discord のIDはどちらも数字の文字列（snowflake）。
 * **形の合わない値では照合しない** — 空文字や `undefined` が入ると、
 * 同じ値を返した人どうしが1つのアカウントに集まる。
 */
const PLATFORM_USER_ID_PATTERN = /^[0-9]{1,32}$/

export function isPlatformUserId(value: unknown): value is string {
  return typeof value === 'string' && PLATFORM_USER_ID_PATTERN.test(value)
}

/**
 * 手放された名前を空けるときの退避名。
 *
 * **`-` は X にも Discord にもハンドルに使えない文字**なので、本物の
 * ハンドルとは衝突しない。行の id を付けるので退避名どうしも衝突しない。
 * `USERNAME_PATTERN` には合うので、その人のページは開けたままになる。
 * マイグレーションの埋め戻しも同じ形で書いている。
 */
export function releasedUsername(user: { id: string; username: string }): string {
  return `${user.username}-${user.id}`
}

const RESOLVED_USER_SELECT = {
  id: true,
  displayName: true,
  username: true,
  server: true,
  platform: true,
  avatar: true,
  isAdmin: true,
  lastTermsAcceptedAt: true,
} as const

/**
 * 停止（BAN）された人のログインか。**`resolveHostedUser` より前に呼ぶ。**
 *
 * 後で判定すると、停止された人のログインでも行の名前・表示名・アイコンが
 * 書き換わる（停止された人が、残っている参加の記録などに出る姿を変えられる）。
 *
 * **IDで見つかれば、その行の停止だけを見る。** 名前の停止で判定すると、停止された
 * 人が手放した名前を取った別人まで締め出してしまう。名前で引くのは、IDで
 * 見つからないとき（初めて入る人）だけで、停止された行が本人かどうかを
 * IDで確かめられないとき（行が消えている・IDを持たない行）に限って断る。
 */
export async function isBannedHostedLogin(
  input: Pick<HostedUserInput, 'server' | 'platformUserId' | 'username'>
): Promise<boolean> {
  const { server, platformUserId, username } = input

  const byId = await prisma.user.findUnique({
    where: { server_platformUserId: { server, platformUserId } },
    select: { ban: { select: { id: true } } },
  })
  if (byId) return byId.ban !== null

  const byName = await prisma.bannedUser.findUnique({
    where: { username_server: { username, server } },
    select: { user: { select: { platformUserId: true } } },
  })
  if (!byName) return false
  // 停止された行がIDを持っていれば、IDで見つからなかった＝別人
  return !byName.user?.platformUserId
}

export async function resolveHostedUser(input: HostedUserInput) {
  const { platform, server, platformUserId, username, displayName, avatar } = input
  /*
    **ログインのたびに同期する列だけを書く。** bio / email / socialAccounts /
    homepageUrls は本人が書いたもので、ここで触るとログインのたびに消える
    （schema.prisma の User を参照）。
  */
  const synced = { username, displayName, avatar, platform }

  return prisma.$transaction(async (tx) => {
    const byId = await tx.user.findUnique({
      where: { server_platformUserId: { server, platformUserId } },
      select: { id: true },
    })
    const holder = await tx.user.findUnique({
      where: { username_server: { username, server } },
      select: { id: true, username: true, platformUserId: true },
    })

    if (holder && holder.id !== byId?.id) {
      // 名前だけが同じ別人の行。**先に空けないと、下の書き換えが一意制約で落ちる**
      await tx.user.update({
        where: { id: holder.id },
        data: { username: releasedUsername(holder) },
      })
    }

    if (byId) {
      return tx.user.update({
        where: { id: byId.id },
        data: synced,
        select: RESOLVED_USER_SELECT,
      })
    }

    return tx.user.create({
      data: { ...synced, server, platformUserId },
      select: RESOLVED_USER_SELECT,
    })
  })
}
