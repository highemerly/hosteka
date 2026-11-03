import 'server-only'

import type { Prisma } from '@/generated/prisma/client'
import type { ProfileListScope } from '@/schemas/user'

import { PUBLIC_EVENT_CONDITIONS } from './event-list'
import { PUBLIC_PRE_EVENT_CONDITIONS } from './pre-event-list'

/**
 * ユーザーのページとグループのページが並べるものの条件。
 *
 * **一覧と件数が同じ定義を読む。** 別々に書くと「32件と出ているのに
 * 20件しか出てこない」が起きる。実際グループの詳細がそうなっていた
 * （`_count` に where が無く、非公開のイベントまで数えていた）。
 *
 * ページ送りは `/api/v1/users/[handle]/events` などの一覧ルートが持ち、
 * 詳細ルートは件数だけをここから取る。
 */

/**
 * ある人のページに並べる公開イベント。
 *
 * - `all`: 作成したもの ＋ **いま所属しているグループ**のもの。グループの
 *   活動もその人の活動として見せる
 * - `personal`: グループ名義のものを除いた、個人で主催しているものだけ。
 *   **作成者が本人でもグループ名義なら外す**（名義で分けるのであって、
 *   誰が作ったかで分けるのではない）
 *
 * 所属は `organization.admins` をその場で引く。抜けたグループのものは
 * 並ばなくなる（本人が作ったものは `all` に残る）。
 */
export function eventsByUser(userId: string, scope: ProfileListScope): Prisma.EventWhereInput {
  return { AND: [...PUBLIC_EVENT_CONDITIONS, ...ownedBy(userId, scope)] }
}

export function preEventsByUser(
  userId: string,
  scope: ProfileListScope
): Prisma.PreEventWhereInput {
  return { AND: [...PUBLIC_PRE_EVENT_CONDITIONS, ...ownedBy(userId, scope)] }
}

/** イベントと日程調整で同じ形。列の名前がそろっているので1つで足りる */
function ownedBy(userId: string, scope: ProfileListScope) {
  if (scope === 'personal') return [{ creatorId: userId }, { organizationId: null }]
  return [
    {
      OR: [
        { creatorId: userId },
        { organization: { admins: { some: { userId } } } },
      ],
    },
  ]
}

/**
 * あるグループのイベント。
 *
 * **一覧に載せない設定のものも外す**（ユーザーのページと同じ条件）。
 * 以前は「グループの活動ではある」として並べていたが、フォームは
 * 「URLを知っている人だけが閲覧できる」と約束している。未ログインでも
 * 開けるページからリンクを張ると、その約束が破れ、検索エンジンにも辿られる。
 */
export function eventsByOrg(orgId: string): Prisma.EventWhereInput {
  return { AND: [...PUBLIC_EVENT_CONDITIONS, { organizationId: orgId }] }
}

export function preEventsByOrg(orgId: string): Prisma.PreEventWhereInput {
  return { AND: [...PUBLIC_PRE_EVENT_CONDITIONS, { organizationId: orgId }] }
}
