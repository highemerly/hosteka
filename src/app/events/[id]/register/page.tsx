import type { Metadata } from 'next'

import AttendanceScreen from '@/screens/events/AttendanceScreen'

/**
 * 出欠登録（当日の記録）。
 *
 * **このページはセッションもデータも取得しない。** 権限の判定は API
 * （`requireEventOrganizer`）が行う。シェルは `[id]/layout.tsx`。
 */
export const metadata: Metadata = {
  title: '出欠登録 - Hosteka',
  robots: { index: false },
}

type Props = { params: Promise<{ id: string }> }

export default async function AttendanceRegisterPage({ params }: Props) {
  const { id } = await params
  return <AttendanceScreen eventId={id} />
}
