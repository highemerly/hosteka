import 'server-only'

import type { Prisma } from '@/generated/prisma/client'

import { USER_PUBLIC_SELECT } from '@/lib/select-presets'

/**
 * 一覧カードが描くものだけを取る select。
 *
 * **回答者は全部読む。** イベント側は take で絞れるが、日程調整は
 * 「日程 × 人」で行があるため、take すると同じ人の別日程ばかり拾って
 * 実人数が数えられない。代わりに userId と user だけに絞って軽くする。
 */
export const PRE_EVENT_LIST_SELECT = {
  id: true,
  title: true,
  hashtags: true,
  location: true,
  fee: true,
  registrationDeadline: true,
  creator: { select: USER_PUBLIC_SELECT },
  organization: { select: { id: true, slug: true, name: true } },
  dateOptions: {
    orderBy: { displayOrder: 'asc' },
    select: { id: true, startDate: true, endDate: true },
  },
  participants: {
    select: { userId: true, user: { select: USER_PUBLIC_SELECT } },
  },
} satisfies Prisma.PreEventSelect

/**
 * 公開一覧に出してよい日程調整の条件。
 *
 * **イベント側の `PUBLIC_EVENT_CONDITIONS` と対。** 画面ごとに書き分けると
 * 見える範囲がずれる（sections と sitemap で公開範囲が違う、が起きる）。
 * 「終わっていない」は候補日の有無で決まり、呼び出し側で足す
 * （日程調整には開催日が無いため）。
 */
export const PUBLIC_PRE_EVENT_CONDITIONS: Prisma.PreEventWhereInput[] = [
  { isDisabled: false },
  { isPublic: true },
  { isHighlighted: true },
]
