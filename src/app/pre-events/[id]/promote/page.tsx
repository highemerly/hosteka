import type { Metadata } from 'next'

import EventFormScreen from '@/screens/events/EventFormScreen'

/**
 * 日程調整を、候補日の1つでイベントにする。
 *
 * イベントの作成画面を「日程調整から」の形で開く。権限の判定は API
 * （`requirePreEventOwner`）が行う。画面は取得した日程調整の `viewer.canDelete`
 * を見て、作れない人には先に言う。
 */
export const metadata: Metadata = {
  title: 'イベントにする - Hosteka',
  robots: { index: false },
}

type Props = { params: Promise<{ id: string }> }

export default async function PromotePreEventPage({ params }: Props) {
  const { id } = await params
  return <EventFormScreen fromPreEventId={id} />
}
