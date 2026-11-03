import 'server-only'

import type { Metadata } from 'next'

import { prisma } from '@/lib/prisma'
import { toJST } from '@/lib/event-date-utils'
import { missingMetadata, privateMetadata, UNLISTED_ROBOTS } from './hidden'

/**
 * イベント詳細の OGP メタデータ。
 *
 * **このアプリの流入経路は Fediverse のリンクプレビューなので、ここは
 * サーバー側に残す。** クローラーは JS を実行しないため、クライアントで
 * 生成しても意味がない。
 *
 * page.tsx がセッションを読まない限り、出力HTMLは全閲覧者で同一になり
 * CDN キャッシュは維持される。
 */
export async function getEventMetadata(id: string): Promise<Metadata> {
  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      title: true,
      description: true,
      startDate: true,
      endDate: true,
      location: true,
      isDisabled: true,
      isPublic: true,
      isHighlighted: true,
    },
  })

  if (!event || event.isDisabled) {
    return missingMetadata('event')
  }

  // 非公開イベントの場合、詳細情報を含まない汎用メタデータを返す
  if (!event.isPublic) {
    return privateMetadata('event')
  }

  const title = `${event.title} - Hosteka(SNSコミュニティのためのイベントプラットフォーム)`

  // イベント日時を整形（JST強制）
  const formatDateJST = (date: Date): string => {
    const jst = toJST(date)
    const year = jst.getFullYear()
    const month = jst.getMonth() + 1
    const day = jst.getDate()
    return `${year}年${month}月${day}日`
  }

  const startDateStr = formatDateJST(event.startDate)
  const endDateStr = event.endDate ? formatDateJST(event.endDate) : null

  // OGP用のdescription
  let description = event.description || `${event.title}のイベント詳細ページです。`
  if (description.length > 160) {
    description = description.substring(0, 157) + '...'
  }

  // 日時と場所の情報を追加
  const eventInfo = []
  if (endDateStr && endDateStr !== startDateStr) {
    eventInfo.push(`開催日: ${startDateStr}〜${endDateStr}`)
  } else {
    eventInfo.push(`開催日: ${startDateStr}`)
  }
  if (event.location) {
    eventInfo.push(`場所: ${event.location}`)
  }

  if (eventInfo.length > 0) {
    description = `${description} ${eventInfo.join(' ')}`
  }

  return {
    title,
    description,
    ...(!event.isHighlighted && { robots: UNLISTED_ROBOTS }),
    openGraph: {
      siteName: 'Hosteka',
      title: event.title,
      description,
      type: 'website',
      locale: 'ja_JP',
    },
    twitter: {
      card: 'summary',
      title: event.title,
      description,
    },
  }
}
