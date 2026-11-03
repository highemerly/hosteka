/**
 * 投稿先ごとの制限と公開範囲。
 *
 * **投稿先が決めるものであって、Hosteka が決めるものではない。**
 * 文字数を1箇所に集めておかないと、画面の残り文字数と分割の計算が
 * 別々の上限で動き、「収まっているのに分割される」ことが起きる。
 */

import type { PostNetwork } from './post-method'

/** X の上限。ここを超えると投稿できない */
const TWITTER_LIMIT = 280
/** Misskey の既定。サーバーごとに違うが、既定値より広いことはまず無い */
const MISSKEY_LIMIT = 3000
/** Mastodon の既定。サーバーが広げていることもあるが、狭い側に倒す */
const MASTODON_LIMIT = 500

/**
 * `platform` は**投稿元の**プラットフォーム。分からないとき（自分の
 * サーバー以外から投稿するとき）は空文字を渡す — Mastodon の上限に倒れる。
 */
export function messageLimit(network: PostNetwork, platform: string): number {
  if (network === 'twitter') return TWITTER_LIMIT
  if (platform.toLowerCase() === 'misskey') return MISSKEY_LIMIT
  return MASTODON_LIMIT
}

export type VisibilityOption = { value: string; label: string }

/**
 * 公開範囲の選択肢。
 *
 * **プラットフォームごとに値も意味も違う。** Mastodon の `private` は
 * フォロワー限定、Misskey では `followers`。合わせようとすると、
 * どちらかに存在しない値を送ることになる。
 */
export function visibilityOptions(platform: string): VisibilityOption[] {
  switch (platform.toLowerCase()) {
    case 'mastodon':
      return [
        { value: 'public', label: 'パブリック（誰でも見られる）' },
        { value: 'unlisted', label: '未収載（タイムラインに流れない）' },
        { value: 'private', label: 'フォロワー限定' },
        { value: 'direct', label: 'ダイレクト（メンション先のみ）' },
      ]
    case 'misskey':
      return [
        { value: 'public', label: 'パブリック（誰でも見られる）' },
        { value: 'home', label: 'ホーム（フォロワーのタイムライン）' },
        { value: 'followers', label: 'フォロワー限定' },
        { value: 'specified', label: 'メンション先のみ' },
      ]
    default:
      return [{ value: 'public', label: 'パブリック（誰でも見られる）' }]
  }
}

/**
 * 短い呼び名。バッジのような狭い場所で使う。
 *
 * **選択肢の表から引く。** 別の表を作ると、片方だけ増えた値が
 * 「選べるのに名前が出ない」形で残る。説明（括弧の中）は選ぶときのもので、
 * 既に決まっているものを見るときには要らない。
 */
export function visibilityShortLabel(platform: string, value: string): string {
  const label = visibilityOptions(platform).find((o) => o.value === value)?.label
  return label ? label.replace(/（.*$/, '') : value
}

/**
 * いま選べる公開範囲か。
 * プラットフォームを跨いで値を持ち回ると、送信で弾かれる値が残る。
 */
export function normalizeVisibility(platform: string, value: string): string {
  const options = visibilityOptions(platform)
  return options.some((o) => o.value === value) ? value : options[0].value
}
