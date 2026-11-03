import { prisma } from '@/lib/prisma'
import { USER_PROFILE_PUBLIC_SELECT } from '@/lib/select-presets'
import { parseUserHandle } from '@/lib/user-handle'
import { userHandleParam, type ProfileListScope } from '@/schemas/user'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { eventsByUser, preEventsByUser } from '@/server/queries/profile-lists'
import { serializeUserProfile, type PublicUserProfileDto } from '@/server/serializers/user'

export type UserOrganizationDto = {
  id: string
  slug: string
  name: string
  /** "admin" | "staff"。誰に頼めばいいかが分かるように出す */
  role: string
}

export type UserProfileStatsDto = {
  /** 一覧に並ぶ公開イベントの数 */
  events: number
  /** 一覧に並ぶ公開日程調整の数 */
  preEvents: number
  /** のべ参加者 */
  people: number
}

export type UserProfileDto = PublicUserProfileDto & {
  /**
   * メールアドレスを登録しているか。**アドレスそのものは返さない。**
   *
   * これが無いと「押しても何も出ないボタン」を全員に見せることになる。
   * 真偽値だけなら、押す価値があるかの判断に足りる。
   */
  hasEmail: boolean
  organizations: UserOrganizationDto[]
  /**
   * 一覧の絞り込み（`scope`）ごとの規模。**両方を1回で返す。**
   * 切り替えのたびに詳細を引き直すと、見出しの数字が読み込み中に消える。
   */
  stats: Record<ProfileListScope, UserProfileStatsDto>
}

/**
 * ユーザーのページ（公開）。
 *
 * **未ログインでも見られる。** 誰が何を主催しているかは公開情報で、
 * イベントのページに主催者として既に出ている。
 *
 * **規模は下に並ぶ一覧と同じ条件で数える**（`eventsByUser`）。所属グループの
 * ものを含めるかどうかは一覧の切り替えに従うので、両方の数を返す。
 */
export const GET = defineRoute({
  auth: 'none',
  params: userHandleParam,
  handler: async ({ params }): Promise<UserProfileDto> => {
    const handle = parseUserHandle(params.handle)
    if (!handle) throw ApiError.notFound('ユーザーが見つかりません')

    const user = await prisma.user.findUnique({
      where: { username_server: handle },
      select: {
        ...USER_PROFILE_PUBLIC_SELECT,
        /*
          メールアドレスは**登録の有無だけ**を見る。値は返さない
          （`./email/route.ts` が `auth: 'required'` で返す）。
        */
        email: true,
        /*
          停止されていれば、そのページは無いものとして扱う。
          一覧に出ない人のページだけが開ける状態を作らない。
        */
        ban: { select: { id: true } },
        organizationAdmins: {
          orderBy: { createdAt: 'asc' },
          select: {
            role: true,
            organization: { select: { id: true, slug: true, name: true } },
          },
        },
      },
    })

    if (!user || user.ban) throw ApiError.notFound('ユーザーが見つかりません')

    /*
      **一覧ルート（`./events`・`./pre-events`）と同じ条件を読む。**
      別々に書くと「32件と出ているのに20件しか出てこない」が起きる。
    */
    const [all, personal] = await Promise.all([
      countStats(user.id, 'all'),
      countStats(user.id, 'personal'),
    ])

    return {
      ...serializeUserProfile(user),
      hasEmail: Boolean(user.email),
      organizations: user.organizationAdmins.map((a) => ({
        id: a.organization.id,
        slug: a.organization.slug,
        name: a.organization.name,
        role: a.role,
      })),
      stats: { all, personal },
    }
  },
})

async function countStats(userId: string, scope: ProfileListScope): Promise<UserProfileStatsDto> {
  const publicEvent = eventsByUser(userId, scope)
  const publicPreEvent = preEventsByUser(userId, scope)

  const [events, preEvents, attendees, responders] = await Promise.all([
    prisma.event.count({ where: publicEvent }),
    prisma.preEvent.count({ where: publicPreEvent }),
    // 席を取っている人だけ数える。キャンセルと不参加は数えない
    prisma.eventParticipant.count({
      where: { event: publicEvent, status: { in: ['attending', 'maybe'] } },
    }),
    /*
      日程調整の回答者は**実人数**で数える。回答の行は「候補日 × 人」で
      増えるので、行を数えると候補日を多く並べた人ほど大きな数字になる。
    */
    prisma.preEventParticipant
      .groupBy({ by: ['userId'], where: { preEvent: publicPreEvent } })
      .then((rows) => rows.length),
  ])

  return { events, preEvents, people: attendees + responders }
}
