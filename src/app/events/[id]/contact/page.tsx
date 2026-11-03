import type { Metadata } from 'next'

import EventContactScreen from '@/screens/events/EventContactScreen'

/**
 * 参加者への連絡。
 *
 * **このページはセッションもデータも取得しない。** 誰が開けるか
 * （主催者と参加者）は API が決める。シェルは `[id]/layout.tsx`。
 */
export const metadata: Metadata = {
  title: '参加者への連絡 - Hosteka',
  robots: { index: false },
}

type Props = { params: Promise<{ id: string }> }

export default async function EventContactPage({ params }: Props) {
  const { id } = await params
  return <EventContactScreen eventId={id} />
}
