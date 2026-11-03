/**
 * 「どこへ・誰に・何件に分けて」投稿するか。
 *
 * **1つの投稿は Fediverse と X の両方には届かない**ので、宛先が両方に
 * いれば投稿も2つになる。以前はこれを「投稿方法」の選択肢として並べ、
 * 切り替えて2回やり直させていた。ここでは宛先から投稿先を割り出し、
 * 画面は投稿先ごとにボタンを出す。
 *
 * **宛名は本文に書き込まない。** 投稿先ごとに形が違う（X は `@user`、
 * Fediverse は `@user@server`）ので、1つの入力欄には載せられない。
 * 本文は1つ、宛名は投稿先ごとにここで付ける。
 */

import { splitMessage, type SplitPost } from '@/lib/message-splitter'

import { buildMentions, reachableUsers, type ContactUser } from './mentions'
import { messageLimit } from './post-limits'
import {
  isFediversePlatform,
  isTwitterPlatform,
  type ContactViewer,
  type PostMethod,
  type PostNetwork,
} from './post-method'

export type PostDestination = {
  network: PostNetwork
  /**
   * 投稿元のサーバー。**決まらないなら null** — 投稿画面（anypost.dev）に
   * 選ばせる。X は常に `x.com`。
   */
  server: string | null
  /** この投稿で届く相手 */
  users: ContactUser[]
  /** 1件あたりの文字数の上限 */
  limit: number
}

/**
 * 投稿先を割り出す。
 *
 * - 直接投稿は自分のアカウントからの1つだけ。**X の人には届かない**
 *   （直接投稿できるのは Mastodon / Misskey だけなので、常に Fediverse 宛）
 * - 投稿画面へ移動するときは、宛先がいるネットワークの数だけ出す
 *
 * `fromServer` は投稿元サーバーの入力欄の値（整形済み）。Fediverse で
 * ログインしている人にだけ意味がある — 既定は自分のサーバーだが、
 * 別のサーバーのアカウントから投稿したい人が書き換える。
 */
export function postDestinations(input: {
  method: PostMethod
  viewer: ContactViewer
  users: ContactUser[]
  fromServer: string
}): PostDestination[] {
  const { method, viewer } = input
  const fediverse = reachableUsers(input.users, 'fediverse')

  if (method === 'direct') {
    return [
      {
        network: 'fediverse',
        server: viewer.server,
        users: fediverse,
        limit: messageLimit('fediverse', viewer.platform),
      },
    ]
  }

  const twitter = reachableUsers(input.users, 'twitter')
  const viewerOnTwitter = isTwitterPlatform(viewer.platform)
  /*
    **宛先が1人もいなくても1つは残す。** 回答がまだ無い日程調整でも、
    主催者は「これから答えてほしい」と声をかけたい。自分の居場所から出す。
  */
  const nobody = fediverse.length === 0 && twitter.length === 0

  const destinations: PostDestination[] = []
  if (fediverse.length > 0 || (nobody && !viewerOnTwitter)) {
    const server = isFediversePlatform(viewer.platform) ? input.fromServer || null : null
    destinations.push({
      network: 'fediverse',
      server,
      users: fediverse,
      // 自分のサーバーでなければ種別が分からない。狭い側（Mastodon）に倒す
      limit: messageLimit('fediverse', server === viewer.server ? viewer.platform : ''),
    })
  }
  if (twitter.length > 0 || (nobody && viewerOnTwitter)) {
    destinations.push({
      network: 'twitter',
      server: 'x.com',
      users: twitter,
      limit: messageLimit('twitter', 'twitter'),
    })
  }

  // 自分の居場所を先に出す
  return viewerOnTwitter ? destinations.reverse() : destinations
}

/** ボタンや注記に出す投稿先の名前 */
export function destinationName(destination: PostDestination): string {
  return destination.server ?? 'Fediverse サーバー'
}

export type DestinationPlan = PostDestination & {
  /** 実際に送る投稿。宛先が多ければ複数に分かれる */
  posts: SplitPost[]
  /** 分けなかったとしたら何文字か（宛名を含む）。上限と並べて見せる */
  length: number
}

/**
 * 本文に宛名を付けて、投稿先ごとの投稿を組む。
 *
 * `abbreviate` は「同じサーバーの相手は `@名前` だけにする」。縮める基準は
 * **投稿元の**サーバー（自分のサーバーとは限らない）。投稿元が決まらない
 * ときは縮めない — どのサーバーから見て同じなのかが分からない。
 */
export function planPosts(
  destinations: PostDestination[],
  body: string,
  abbreviate: boolean
): DestinationPlan[] {
  const text = body.trim()
  return destinations.map((destination) => {
    const mentions = buildMentions(destination.users, {
      network: destination.network,
      abbreviateOnServer: abbreviate ? (destination.server ?? undefined) : undefined,
    })
    return {
      ...destination,
      posts: splitMessage(mentions, text, destination.limit).posts,
      length: mentions.length > 0 ? mentions.join(' ').length + 2 + text.length : text.length,
    }
  })
}

/**
 * anypost.dev の投稿画面。**すぐには投稿されない**（内容を確認してから送る）。
 *
 * 投稿元が決まっているときだけ投稿画面まで進める（`a=1`）。決まらない
 * まま進めても、サーバーの選択画面に戻るだけになる。
 */
export function buildExternalUrl(input: { destination: PostDestination; text: string }): string {
  const params = new URLSearchParams()
  params.set('t', input.text)
  /*
    **公開範囲は常にパブリックで渡す。** 移動先の投稿画面で変えられるので、
    こちらでは選ばせない。直接投稿用に選んだ値も持ち込まない。
  */
  params.set('v', 'public')
  if (input.destination.server) {
    params.set('i', input.destination.server)
    params.set('a', '1')
  }
  return `https://anypost.dev/share?${params.toString()}`
}
