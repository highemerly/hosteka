import 'server-only'

import type { Prisma } from '@/generated/prisma/client'

import { explainIneligibility, isUserAllowed } from '@/lib/participation-utils'
import { USER_PUBLIC_SELECT } from '@/lib/select-presets'
import type { Session } from '@/server/auth/session'
import type { PreEventViewerInput } from '@/server/serializers/pre-event'

/**
 * 詳細ページが描くものを取る select。
 *
 * **GET と PUT で同じものを使う。** 更新の応答は「更新した結果の詳細」なので、
 * 取得と同じ形でなければ契約が2つになる（OpenAPI を生成すると、同じ
 * リソースに2つの型ができる）。
 */
export const PRE_EVENT_DETAIL_SELECT = {
  id: true,
  title: true,
  description: true,
  location: true,
  fee: true,
  relatedUrl: true,
  terms: true,
  isPublic: true,
  isHighlighted: true,
  allowAutoRegistration: true,
  registrationDeadline: true,
  allowedFediverseServers: true,
  isAllowedForFediverse: true,
  isAllowedForDiscord: true,
  isAllowedForTwitter: true,
  createdAt: true,
  updatedAt: true,
  creator: { select: USER_PUBLIC_SELECT },
  organization: { select: { id: true, slug: true, name: true } },
  dateOptions: {
    orderBy: { displayOrder: 'asc' },
    select: { id: true, startDate: true, endDate: true, displayOrder: true },
  },
  participants: {
    select: {
      userId: true,
      dateOptionId: true,
      status: true,
      comment: true,
      autoRegisterWhenPromoted: true,
      termsAcceptedAt: true,
      // 回答者を「先に答えた順」に並べるのに使う
      createdAt: true,
      user: { select: USER_PUBLIC_SELECT },
    },
  },
} satisfies Prisma.PreEventSelect

/** 参加できるかの判定に要る欄だけ */
type PlatformSettings = {
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
  allowedFediverseServers: string | null
}

/**
 * 閲覧者から見た状態。
 *
 * **「回答できるか」は認可と同じ規則に依存する。** GET と PUT で別々に
 * 組み立てると、同じ日程調整が経路によって違う姿で返る。
 * `isOrganizer` だけは呼び出し側が渡す（PUT はガードで確定済み、
 * GET は問い合わせて決める）。
 */
export function preEventViewer(
  preEvent: PlatformSettings,
  session: Session | null,
  isOrganizer: boolean,
  canDelete: boolean
): PreEventViewerInput {
  const userPlatform = session?.user.platform
  const userServer = session?.user.server

  return {
    isAuthenticated: Boolean(session),
    isOrganizer,
    canDelete,
    userId: session?.user.id ?? null,
    isEligible: isUserAllowed(userPlatform, userServer, preEvent),
    ineligibleReason: explainIneligibility(userPlatform, userServer, preEvent),
  }
}
