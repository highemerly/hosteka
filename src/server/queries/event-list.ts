import 'server-only'

import type { Prisma } from '@/generated/prisma/client'

import { USER_PUBLIC_SELECT } from '@/lib/select-presets'
import { LIST_AVATAR_LIMIT } from '@/server/serializers/event'

/**
 * 一覧カードが描くものだけを取る select。
 *
 * **詳細用の include を使い回さない。** あちらは参加者全員・
 * オプショングループ・規約まで含むので、カードを数十枚並べると
 * ペイロードが桁で変わる。
 *
 * 参加者はアバターに出す数だけ take し、総数は filtered count で数える。
 * 全員読んでから絞ると件数分だけ無駄に読む。
 */
export const EVENT_LIST_SELECT = {
  id: true,
  title: true,
  hashtags: true,
  startDate: true,
  // 時刻は別列。**日付だけ取ると 19:00 が 09:00 になる**
  // （lib/event-datetime.ts の composeDateTime）
  startTime: true,
  endDate: true,
  endTime: true,
  hasStartTime: true,
  hasEndTime: true,
  location: true,
  fee: true,
  status: true,
  maxParticipants: true,
  registrationDeadlineDate: true,
  registrationDeadlineTime: true,
  creator: { select: USER_PUBLIC_SELECT },
  organization: { select: { id: true, slug: true, name: true } },
  participants: {
    where: { status: 'attending' },
    take: LIST_AVATAR_LIMIT,
    orderBy: { createdAt: 'asc' },
    select: { user: { select: USER_PUBLIC_SELECT } },
  },
  _count: { select: { participants: { where: { status: 'attending' } } } },
} satisfies Prisma.EventSelect

/** 公開一覧に出してよいイベントの条件。画面ごとにここがずれると見える範囲が変わる */
export const PUBLIC_EVENT_CONDITIONS: Prisma.EventWhereInput[] = [
  { isDisabled: false },
  { isPublic: true },
  { isHighlighted: true },
]

/** 終了したか否かの条件。endDate が無いイベントは startDate で判定する */
export function endedCondition(ended: boolean, now: Date): Prisma.EventWhereInput {
  return ended
    ? {
        OR: [
          { endDate: { lt: now } },
          { AND: [{ endDate: null }, { startDate: { lt: now } }] },
        ],
      }
    : {
        OR: [
          { endDate: { gte: now } },
          { AND: [{ endDate: null }, { startDate: { gte: now } }] },
        ],
      }
}
