import type { Metadata } from 'next'

import { getAnnouncementMetadata } from '@/server/metadata/announcement'
import AnnouncementScreen from '@/screens/content/AnnouncementScreen'

type Props = { params: Promise<{ id: string }> }

/**
 * お知らせ1件。
 *
 * **generateMetadata だけがサーバーで動く。** 本文は
 * `GET /api/v1/announcements/:id` をクライアントから取る。
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  return getAnnouncementMetadata(id)
}

export default async function AnnouncementPage({ params }: Props) {
  const { id } = await params
  return <AnnouncementScreen id={id} />
}
