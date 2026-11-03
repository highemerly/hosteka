import 'server-only'

import type { Prisma } from '@/generated/prisma/client'

/**
 * お知らせの select。**公開側と管理側で共有する。**
 * 同じリソースに契約が2つできるのを避ける（`notification.ts` と同じ理由）。
 *
 * 作成日時と更新日時は載せない。閲覧者にとっての時刻は「公開日時」だけで、
 * 管理側も直したことを画面に出す必要がない。
 */
export const ANNOUNCEMENT_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  publishedAt: true,
  pinnedUntil: true,
} satisfies Prisma.AnnouncementSelect

export type AnnouncementRow = Prisma.AnnouncementGetPayload<{
  select: typeof ANNOUNCEMENT_SELECT
}>
