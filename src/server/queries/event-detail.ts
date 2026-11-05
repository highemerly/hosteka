import 'server-only'

import type { Prisma } from '@/generated/prisma/client'

import { explainIneligibility, isUserAllowed } from '@/lib/participation-utils'
import { USER_PUBLIC_SELECT } from '@/lib/select-presets'
import type { Session } from '@/server/auth/session'
import type { ViewerInput } from '@/server/serializers/event'

/**
 * 詳細ページが描くものを取る include。
 *
 * **GET と PUT で同じものを使う。** 更新の応答は「更新した結果の詳細」なので、
 * 取得と同じ形でなければ契約が2つになる（`pre-event-detail.ts` と同じ考え方）。
 */
export const EVENT_DETAIL_INCLUDE = {
  creator: { select: USER_PUBLIC_SELECT },
  organization: {
    select: { id: true, slug: true, name: true, admins: { select: { userId: true } } },
  },
  participants: {
    include: {
      user: { select: USER_PUBLIC_SELECT },
      groupSelections: {
        include: { options: { include: { option: true } } },
      },
    },
  },
  optionGroups: {
    include: {
      options: { orderBy: { displayOrder: 'asc' } },
    },
    orderBy: { displayOrder: 'asc' },
  },
} satisfies Prisma.EventInclude

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
 * **「参加できるか」は認可と同じ規則に依存する。** GET と PUT で別々に
 * 組み立てると、同じイベントが経路によって違う姿で返る。
 * `isOrganizer` と `canCancel` は呼び出し側が渡す（PUT はガードで幹事が確定済み、
 * GET は問い合わせて決める）。
 */
export function eventViewer(
  event: PlatformSettings,
  session: Session | null,
  isOrganizer: boolean,
  canCancel: boolean
): ViewerInput {
  const userPlatform = session?.user.platform
  const userServer = session?.user.server
  const settings = {
    isAllowedForFediverse: event.isAllowedForFediverse,
    isAllowedForDiscord: event.isAllowedForDiscord,
    isAllowedForTwitter: event.isAllowedForTwitter,
    allowedFediverseServers: event.allowedFediverseServers,
  }

  return {
    isAuthenticated: Boolean(session),
    isOrganizer,
    canCancel,
    userId: session?.user.id ?? null,
    isEligible: isUserAllowed(userPlatform, userServer, settings),
    ineligibleReason: explainIneligibility(userPlatform, userServer, settings),
  }
}
