import 'server-only'

import type { Metadata } from 'next'

/**
 * 見せないものに返すメタデータ。
 *
 * **判定を書き分けない。** 種別ごとに書くと、どれかが漏れる。
 * `robots: { index: false }` は検索避けの**お願い**であってアクセス制御では
 * ないので、それだけでは URL を知っていれば `<meta>` から中身が読める。
 *
 * 新しい種別を足すときも、ここへ1行足して同じ関数を通すこと。
 */

type Kind = 'event' | 'pre-event'

const LABELS: Record<Kind, { noun: string; missing: string }> = {
  event: { noun: 'イベント', missing: 'このイベントは存在しないか、削除された可能性があります。' },
  'pre-event': { noun: '日程調整', missing: 'この日程調整は削除されたか、存在しません。' },
}

/** 無いもの・無効化されたもの */
export function missingMetadata(kind: Kind): Metadata {
  const { noun, missing } = LABELS[kind]
  return {
    title: `${noun}が見つかりません - Hosteka`,
    description: missing,
    robots: { index: false, follow: false },
  }
}

/**
 * 非公開のもの。**題名も説明も場所も日付も出さない。**
 *
 * クローラーだけでなく、URL を踏んだ未ログインの人にも中身を渡さない。
 */
export function privateMetadata(kind: Kind): Metadata {
  const { noun } = LABELS[kind]
  const title = `${noun} - Hosteka`
  const description = `Hosteka の${noun}です。詳細を見るにはログインが必要な場合があります。`
  const shortDescription = `Hosteka の${noun}です。`

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      siteName: 'Hosteka',
      title,
      description: shortDescription,
      type: 'website',
      locale: 'ja_JP',
    },
    twitter: { card: 'summary', title, description: shortDescription },
  }
}

/**
 * 一覧に載せない設定のもの（`isHighlighted: false`）に足す robots。
 *
 * **中身は出す。** URL を知っている人が開けるものなので、共有したときの
 * リンクプレビューは残す。止めるのは検索エンジンへの索引だけ。
 * sitemap から外すだけでは足りない — グループのページや SNS に貼られた
 * URL から辿られると索引される。フォームは「検索に表示されなくなる」と
 * 約束している。
 */
export const UNLISTED_ROBOTS: Metadata['robots'] = { index: false }
