import type { Metadata } from 'next'

import CancelEventScreen from '@/screens/events/CancelEventScreen'

/**
 * イベントの中止。
 *
 * **このページはセッションもデータも取得しない。** 権限の判定は API
 * （`requireEventOrganizer`）が行う。シェルは `[id]/layout.tsx`。
 */
export const metadata: Metadata = {
  title: 'イベントを中止 - Hosteka',
  robots: { index: false },
}

type Props = { params: Promise<{ id: string }> }

export default async function CancelEventPage({ params }: Props) {
  const { id } = await params
  return <CancelEventScreen eventId={id} />
}
