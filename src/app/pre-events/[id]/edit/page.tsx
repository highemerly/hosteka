import type { Metadata } from 'next'

import PreEventFormScreen from '@/screens/pre-events/PreEventFormScreen'

/**
 * 日程調整の編集。
 *
 * 権限の判定は API（`requirePreEventOrganizer`）が行う。主催者でなければ
 * 取得が 403 になり、画面がその旨を出す。シェルは `[id]/layout.tsx`。
 */
export const metadata: Metadata = {
  title: '日程調整を編集 - Hosteka',
  robots: { index: false },
}

type Props = { params: Promise<{ id: string }> }

export default async function EditPreEventPage({ params }: Props) {
  const { id } = await params
  return <PreEventFormScreen preEventId={id} />
}
