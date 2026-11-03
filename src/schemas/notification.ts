import { z } from 'zod'

import { paginationQuery } from './common'

/**
 * 通知の種類と分類。**kind の定義元はここ。**
 *
 * `prisma/schema.prisma` の `Notification.kind` は文字列列で、候補を doc コメントに
 * 並べてあるだけ（このリポジトリは enum 型を使わない）。実際に候補を縛るのは
 * この union で、サーバーの検証と画面の絞り込みが同じものを読む。
 */

export const NOTIFICATION_KINDS = [
  // 主催・幹事に届くもの
  'participation_requested',
  'participation_registered',
  'participation_cancelled',
  'pre_event_answered',
  // 参加している人に届くもの
  'participation_approved',
  'participation_rejected',
  'participation_removed',
  'event_updated',
  'event_cancelled',
  'pre_event_updated',
  'pre_event_deleted',
  // 役割が変わったとき
  'organizer_assigned',
  'organizer_unassigned',
  'org_admin_added',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

export const notificationKind = z.enum(NOTIFICATION_KINDS)

export const NOTIFICATION_TARGET_TYPES = ['event', 'pre_event', 'org'] as const
export type NotificationTargetType = (typeof NOTIFICATION_TARGET_TYPES)[number]

/**
 * 絞り込みの軸。
 *
 *   - organizer  … 自分が主催・幹事をしているものへの動き
 *   - participant … 自分が参加しているものの変化
 *   - role        … 自分の役割が変わった
 */
export const NOTIFICATION_CATEGORIES = ['organizer', 'participant', 'role'] as const
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

export const notificationCategory = z.enum(NOTIFICATION_CATEGORIES)

/**
 * kind の分類。**列に持たない。** kind から一意に決まるので、列にすると
 * 表と行が食い違いうるうえ、分類を変えるたびにデータの移行が要る。
 *
 * `Record` なので **kind を足すと typecheck が落ちる**。
 */
export const KIND_CATEGORY: Record<NotificationKind, NotificationCategory> = {
  participation_requested: 'organizer',
  participation_registered: 'organizer',
  participation_cancelled: 'organizer',
  pre_event_answered: 'organizer',

  participation_approved: 'participant',
  participation_rejected: 'participant',
  participation_removed: 'participant',
  event_updated: 'participant',
  event_cancelled: 'participant',
  pre_event_updated: 'participant',
  pre_event_deleted: 'participant',

  organizer_assigned: 'role',
  organizer_unassigned: 'role',
  org_admin_added: 'role',
}

/** 分類に属する kind。API が `?category=` を `kind: { in: [...] }` に展開するのに使う */
export const KINDS_BY_CATEGORY: Record<NotificationCategory, NotificationKind[]> =
  NOTIFICATION_CATEGORIES.reduce(
    (acc, category) => {
      acc[category] = NOTIFICATION_KINDS.filter((kind) => KIND_CATEGORY[kind] === category)
      return acc
    },
    {} as Record<NotificationCategory, NotificationKind[]>
  )

/**
 * 通知一覧の絞り込み。
 *
 * `category` が粗い軸、`kind` が細かい軸。**両方送られたら両方を満たすもの**を返す
 * （画面は「主催」を選んだうえで「参加リクエストだけ」に絞れる）。
 */
export const listNotificationsQuery = paginationQuery.extend({
  category: z.union([notificationCategory, z.literal('all')]).default('all'),
  kind: notificationKind.optional(),
})

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuery>
