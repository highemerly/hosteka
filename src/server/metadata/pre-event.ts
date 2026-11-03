import 'server-only'

import type { Metadata } from 'next'

import { prisma } from '@/lib/prisma'
import { toJST } from '@/lib/event-date-utils'
import { missingMetadata, privateMetadata, UNLISTED_ROBOTS } from './hidden'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/** OGP の説明文の上限。超える分は切る */
const DESCRIPTION_LIMIT = 160

/**
 * 日程調整のメタデータ。
 *
 * **このページで唯一サーバー側がデータを触る場所。** 本文はクライアントが
 * `/api/v1` から取る。公開フィールドしか読まず、セッションも見ないので、
 * 出力HTMLは全閲覧者で同一になり CDN にキャッシュできる。
 *
 * Fediverse のクローラーは JS を実行しないので、リンクプレビューは
 * ここが出す meta タグだけで決まる。
 */
export async function getPreEventMetadata(id: string): Promise<Metadata> {
  const preEvent = await prisma.preEvent.findUnique({
    where: { id },
    select: {
      title: true,
      description: true,
      location: true,
      isPublic: true,
      isHighlighted: true,
      isDisabled: true,
      dateOptions: {
        select: { startDate: true },
        orderBy: { displayOrder: 'asc' },
        take: 3,
      },
    },
  })

  if (!preEvent || preEvent.isDisabled) {
    return missingMetadata('pre-event')
  }

  /*
    **非公開なら中身を出さない。** API（`/api/v1/pre-events/[id]`）は
    未ログインに 401 を返すのに、ここだけが題名・説明・場所・候補日を
    `<meta>` に載せていた。`robots: { index: false }` は検索避けの
    お願いで、URL を踏んだ人には何も効かない。
  */
  if (!preEvent.isPublic) {
    return privateMetadata('pre-event')
  }

  let description = preEvent.description || `${preEvent.title}の日程調整ページです。`
  if (description.length > DESCRIPTION_LIMIT) {
    description = `${description.slice(0, DESCRIPTION_LIMIT - 3)}...`
  }

  const info: string[] = []
  if (preEvent.dateOptions.length > 0) {
    const dates = preEvent.dateOptions.map((option) => {
      const jst = toJST(option.startDate)
      return `${jst.getMonth() + 1}月${jst.getDate()}日(${WEEKDAYS[jst.getDay()]})`
    })
    info.push(`候補日時: ${dates.join('、')}${preEvent.dateOptions.length >= 3 ? '他' : ''}`)
  }
  if (preEvent.location) info.push(`場所: ${preEvent.location}`)
  if (info.length > 0) description = `${description} ${info.join(' ')}`

  return {
    title: `${preEvent.title} - Hosteka (SNSコミュニティのためのイベントプラットフォーム)`,
    description,
    ...(!preEvent.isHighlighted && { robots: UNLISTED_ROBOTS }),
    openGraph: {
      siteName: 'Hosteka',
      title: preEvent.title,
      description,
      type: 'website',
      locale: 'ja_JP',
    },
    twitter: { card: 'summary', title: preEvent.title, description },
  }
}
