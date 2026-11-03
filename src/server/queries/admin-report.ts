import 'server-only'

import type { Prisma } from '@/generated/prisma/client'

/**
 * 通報の select。**一覧と詳細（GET と PATCH）で共有する。**
 *
 * 更新の応答は「更新後の詳細」なので、取得と違う形で返すと
 * 同じリソースに契約が2つできる（`pre-event-detail.ts` と同じ理由）。
 */

const USER_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  server: true,
  platform: true,
} as const

const TARGET_SELECT = {
  id: true,
  title: true,
  createdAt: true,
  isPublic: true,
  isDisabled: true,
  creator: { select: USER_SELECT },
  organization: { select: { slug: true, name: true } },
} as const

/** 詳細では本文と、主催者が主催している件数まで引く（BAN で無効化されるものを数えるため） */
const TARGET_DETAIL_SELECT = {
  ...TARGET_SELECT,
  description: true,
  creator: {
    select: { ...USER_SELECT, _count: { select: { events: true, preEvents: true } } },
  },
} as const

export const REPORT_LIST_SELECT = {
  id: true,
  reason: true,
  status: true,
  adminNote: true,
  reportedAt: true,
  resolvedAt: true,
  reporter: { select: USER_SELECT },
  event: { select: TARGET_SELECT },
  preEvent: { select: TARGET_SELECT },
} satisfies Prisma.ReportSelect

export const REPORT_DETAIL_SELECT = {
  ...REPORT_LIST_SELECT,
  event: { select: TARGET_DETAIL_SELECT },
  preEvent: { select: TARGET_DETAIL_SELECT },
} satisfies Prisma.ReportSelect

export type ReportListRow = Prisma.ReportGetPayload<{ select: typeof REPORT_LIST_SELECT }>
export type ReportDetailRow = Prisma.ReportGetPayload<{ select: typeof REPORT_DETAIL_SELECT }>
