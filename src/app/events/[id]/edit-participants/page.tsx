import type { Metadata } from 'next'

import EditParticipantsScreen from '@/screens/events/EditParticipantsScreen'

/**
 * 参加者を編集。
 *
 * **このページはセッションもデータも取得しない。** 権限の判定は API
 * （`requireEventOrganizer`）が行う。シェルは `[id]/layout.tsx`。
 */
export const metadata: Metadata = {
  title: '参加者を編集 - Hosteka',
  robots: { index: false },
}

type Props = { params: Promise<{ id: string }> }

export default async function EditParticipantsPage({ params }: Props) {
  const { id } = await params
  return <EditParticipantsScreen eventId={id} />
}
