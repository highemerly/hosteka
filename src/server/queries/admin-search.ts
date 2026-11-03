import 'server-only'

import type { Prisma } from '@/generated/prisma/client'

/**
 * 管理画面の検索語を Prisma の条件へ直す。
 *
 * **検索欄は各一覧に1つだけ置く。** 旧画面はユーザー一覧に
 * 「サーバー」「ユーザー名」「IPアドレス」の3欄を並べていたが、
 * 調べたいものは1つの語で足りる。何に当たるかは語の形で決める。
 *
 * 大文字・小文字は区別しない。ホスト名もユーザー名も大小を
 * 区別しない世界の値なので、区別すると「居るのに見つからない」になる。
 */

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' as const })

/**
 * ユーザーの検索。
 *
 * - `alice@example.social`（先頭の `@` は無視）… ユーザー名とサーバーの両方で絞る
 * - それ以外 … ユーザー名・表示名・サーバー・IPアドレス履歴のどれかに含まれる
 *
 * IP を別の欄にしないのは、IP で調べたい人が「IPの欄がある」ことを
 * 知っている必要が無いようにするため。数字とドットの並びは
 * ユーザー名にもサーバー名にもまず当たらないので、混ぜても紛れない。
 */
export function userSearchWhere(search: string): Prisma.UserWhereInput {
  const term = search.replace(/^@/, '')
  const at = term.indexOf('@')

  if (at > 0) {
    const username = term.slice(0, at)
    const server = term.slice(at + 1)
    return {
      AND: [
        { username: insensitive(username) },
        ...(server ? [{ server: insensitive(server) }] : []),
      ],
    }
  }

  return {
    OR: [
      { username: insensitive(term) },
      { displayName: insensitive(term) },
      { server: insensitive(term) },
      { ipAddresses: { contains: term } },
    ],
  }
}

/** BAN 済みの検索。削除方式だった頃の記録には名前しか無いので、ユーザー名とサーバーだけを見る */
export function bannedSearchWhere(search: string): Prisma.BannedUserWhereInput {
  const term = search.replace(/^@/, '')
  const at = term.indexOf('@')

  if (at > 0) {
    const server = term.slice(at + 1)
    return {
      AND: [
        { username: insensitive(term.slice(0, at)) },
        ...(server ? [{ server: insensitive(server) }] : []),
      ],
    }
  }

  return { OR: [{ username: insensitive(term) }, { server: insensitive(term) }] }
}

/** 主催者の検索。イベント・日程調整・グループで共通 */
export function creatorSearchWhere(search: string): Prisma.UserWhereInput {
  const term = search.replace(/^@/, '')
  return {
    OR: [{ displayName: insensitive(term) }, { username: insensitive(term) }],
  }
}

export { insensitive }
