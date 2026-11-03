import 'server-only'

import { parseNotificationPayload, type NotificationPayload } from '@/lib/notification-text'
import type {
  NotificationCategory,
  NotificationKind,
  NotificationTargetType,
} from '@/schemas/notification'
import { KIND_CATEGORY } from '@/schemas/notification'
import type { NotificationListRow } from '@/server/queries/notification'
import { isUnread } from '@/server/notifications/unread'
import { serializeUser, type PublicUserDto } from '@/server/serializers/user'

export type NotificationDto = {
  id: string
  kind: NotificationKind
  /** `kind` から導く。画面が絞り込みの状態を出すのに使う */
  category: NotificationCategory
  targetType: NotificationTargetType
  targetId: string
  /**
   * 対象への導線。**開いたら404になることは許容する** — 消えた対象と
   * 管理者が無効化した対象は区別できず、確かめるにはクエリが1本増える。
   * 取り消し済みのものだけは、辿る先が無いので null にする。
   */
  href: string | null
  /** 原因になった人。退会していれば null */
  actor: PublicUserDto | null
  /** 文言を組み立てるための値の写し */
  payload: NotificationPayload
  occurredAt: string
  repeatCount: number
  /** 引いた時点の既読位置で判定した結果。**画面はこれを見る**（自分で比べない） */
  unread: boolean
}

/** 辿る先が無い種別。対象そのものが消えている */
const NO_LINK_KINDS = new Set<NotificationKind>(['pre_event_deleted'])

function hrefFor(
  kind: NotificationKind,
  targetType: string,
  targetId: string,
  payload: NotificationPayload
): string | null {
  if (NO_LINK_KINDS.has(kind)) return null
  switch (targetType) {
    case 'event':
      return `/events/${targetId}`
    case 'pre_event':
      return `/pre-events/${targetId}`
    case 'org':
      // グループは slug で開く。id を保存してあるのは slug が編集で変わるため
      return payload.orgSlug ? `/orgs/${payload.orgSlug}` : null
    default:
      return null
  }
}

export function serializeNotification(row: NotificationListRow, seenAt: Date): NotificationDto {
  const kind = row.kind as NotificationKind
  const payload = parseNotificationPayload(row.payload)

  return {
    id: row.id,
    kind,
    category: KIND_CATEGORY[kind],
    targetType: row.targetType as NotificationTargetType,
    targetId: row.targetId,
    href: hrefFor(kind, row.targetType, row.targetId, payload),
    actor: row.actor ? serializeUser(row.actor) : null,
    payload,
    occurredAt: row.occurredAt.toISOString(),
    repeatCount: row.repeatCount,
    unread: isUnread(row.occurredAt, seenAt),
  }
}
