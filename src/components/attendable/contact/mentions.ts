/**
 * 宛先とメッセージの組み立て。
 *
 * **投稿先によって宛先が変わる。** X の投稿画面へ渡すのに
 * `@user@mastodon.social` と書いても誰にも届かないし、Fediverse へ
 * `@twitteruser` と書けば無関係の誰かに届く。**届かない相手を
 * 宛先に入れない**のがここの仕事。
 */

import type { PostNetwork } from './post-method'

export type ContactUser = {
  id: string
  username: string
  displayName: string
  avatar: string | null
  server: string
  platform: string
}

export function isTwitterUser(user: ContactUser): boolean {
  return user.platform.toLowerCase() === 'twitter' || user.server === 'x.com'
}

/**
 * その投稿先で実際に届く宛先。
 *
 * X へ投稿するときは X の人だけ、Fediverse へ投稿するときは
 * Fediverse の人だけ。**両方に一度には送れない** — 1つの投稿が
 * 両方のネットワークに届くことはないため。画面は投稿を分けて出す。
 */
export function reachableUsers(users: ContactUser[], network: PostNetwork): ContactUser[] {
  return network === 'twitter'
    ? users.filter(isTwitterUser)
    : users.filter((u) => !isTwitterUser(u))
}

/**
 * メンションの文字列。
 *
 * 同じサーバーの相手は `@user` まで縮められる（`abbreviateOnServer` に
 * **投稿元の**サーバーを渡す。自分のサーバーとは限らない）。**メンションは1人あたり数十文字あり、
 * 30人いれば本文より長くなる。** 縮めれば分割せずに1投稿へ収まることが多い。
 */
export function buildMentions(
  users: ContactUser[],
  options: { network: PostNetwork; abbreviateOnServer?: string }
): string[] {
  return users.map((user) => {
    // X はサーバーの概念が無いので常に @username
    if (options.network === 'twitter') return `@${user.username}`
    if (options.abbreviateOnServer && user.server === options.abbreviateOnServer) {
      return `@${user.username}`
    }
    return `@${user.username}@${user.server}`
  })
}

/**
 * 最初に入っている本文。
 *
 * **書き換える前提の下書き。** 用件と URL が要ることを形で示す。
 * URL を落とすと、受け取った人が戻ってくる先を失う。
 *
 * **宛名は入れない。** 投稿先ごとに形が違うので（`destinations.ts`）、
 * 本文に書き込むと「どの投稿先の宛名か」を本文が持つことになる。
 */
export function buildDefaultBody(input: { title: string; url: string }): string {
  return `${input.title}のお知らせです。\n\n${input.url}`
}
