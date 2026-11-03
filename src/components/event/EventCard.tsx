import { AttendableCard } from '@/components/attendable/AttendableCard'
import { toEventAttendable } from '@/components/attendable/attendable'
import type { EventListItemDto } from '@/server/serializers/event'

/**
 * イベントの一覧カード。
 * 描くのは `AttendableCard`（日程調整と共有）。ここは DTO を
 * カードが見る形へ移すだけ。
 */
export function EventCard({ event }: { event: EventListItemDto }) {
  return <AttendableCard item={toEventAttendable(event)} />
}
