import type { Metadata } from 'next'

import EventFormScreen from '@/screens/events/EventFormScreen'

/**
 * イベントの編集。
 *
 * シェルは `/events/[id]/layout.tsx` が被せる。
 * 権限の判定は API（`requireEventOrganizer`）が行う。
 */
export const metadata: Metadata = {
  title: 'イベントを編集 - Hosteka',
  robots: { index: false },
}

type Props = { params: Promise<{ id: string }> }

export default async function EditEventPage({ params }: Props) {
  const { id } = await params
  return <EventFormScreen eventId={id} />
}
