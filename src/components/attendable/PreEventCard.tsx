import { AttendableCard } from '@/components/attendable/AttendableCard'
import { toPreEventAttendable } from '@/components/attendable/attendable'
import type { PreEventListItemDto } from '@/server/serializers/pre-event'

/**
 * 日程調整の一覧カード。
 * 描くのは `AttendableCard`（イベントと共有）。
 */
export function PreEventCard({ preEvent }: { preEvent: PreEventListItemDto }) {
  return <AttendableCard item={toPreEventAttendable(preEvent)} />
}
