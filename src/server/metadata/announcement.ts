import 'server-only'

import type { Metadata } from 'next'

import { prisma } from '@/lib/prisma'
import { announcementId } from '@/schemas/announcement'

const NOT_FOUND: Metadata = {
  title: 'お知らせ - Hosteka',
  robots: { index: false, follow: false },
}

/**
 * お知らせ詳細のメタデータ。
 *
 * **クローラーは JS を実行しない**ので、題名だけはサーバーで出す
 * （本文はクライアントが `/api/v1` から取る）。
 *
 * 公開前のものと本文の無いものは、API と同じく存在ごと隠す。
 */
export async function getAnnouncementMetadata(rawId: string): Promise<Metadata> {
  const parsed = announcementId.safeParse(rawId)
  if (!parsed.success) return NOT_FOUND
  const id = parsed.data

  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { title: true, body: true, publishedAt: true },
  })

  if (!announcement || !announcement.body || announcement.publishedAt > new Date()) {
    return NOT_FOUND
  }

  const title = `${announcement.title} - Hosteka`
  return {
    title,
    openGraph: { siteName: 'Hosteka', title, type: 'article', locale: 'ja_JP' },
    twitter: { card: 'summary', title },
  }
}
