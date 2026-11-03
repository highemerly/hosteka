import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import { USER_PUBLIC_SELECT } from '@/lib/select-presets'

/**
 * 通知の select。**一覧とベルのポップオーバーで共有する。**
 * 同じリソースに契約が2つできるのを避ける（`admin-report.ts` と同じ理由）。
 */
export const NOTIFICATION_LIST_SELECT = {
  id: true,
  kind: true,
  targetType: true,
  targetId: true,
  payload: true,
  occurredAt: true,
  repeatCount: true,
  actor: { select: USER_PUBLIC_SELECT },
} satisfies Prisma.NotificationSelect

export type NotificationListRow = Prisma.NotificationGetPayload<{
  select: typeof NOTIFICATION_LIST_SELECT
}>
