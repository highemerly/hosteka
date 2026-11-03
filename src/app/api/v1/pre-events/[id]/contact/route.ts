import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { hideDisabledFromNonAdmins } from '@/server/http/guards'
import { ok } from '@/server/http/response'
import { preEventIdParam } from '@/schemas/pre-event'
import { prisma } from '@/lib/prisma'
import { USER_PUBLIC_SELECT } from '@/lib/select-presets'
import { checkPreEventOrganizerPermission } from '@/lib/permissions'
import { decryptAccessToken } from '@/lib/crypto'
import { serializePreEventContact } from '@/server/serializers/pre-event'

/** 直接投稿できるプラットフォーム。ここ以外は外部サービスへ渡す */
const DIRECT_POST_PLATFORMS = ['mastodon', 'misskey']

/**
 * 連絡画面に要るものを1つにまとめて返す。
 *
 * **回答者だけでなく主催者でない人も開ける。** 旧画面と同じで、回答者は
 * 「自分の投稿から他の回答者へ声をかける」ことができる（外部サービスへ
 * 渡す形のみ。Hosteka から直接投稿できるのは主催者だけ）。
 *
 * **アクセストークンは返さない。** 直接投稿できるかどうかだけをここで
 * 判定して真偽値にする。画面はトークンを知る必要がない。
 */
export const GET = defineRoute({
  auth: 'required',
  params: preEventIdParam,
  handler: async ({ params, session }) => {
    const preEvent = await prisma.preEvent.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        isDisabled: true,
        registrationDeadline: true,
      },
    })
    if (!preEvent) throw ApiError.notFound('日程調整が見つかりません')
    await hideDisabledFromNonAdmins(preEvent.isDisabled, session, '日程調整が見つかりません')

    /*
      回答者は「日程 × 人」で行がある。**userId で畳んでから数える** —
      畳まずに宛先へ渡すと、候補日の数だけ同じ人にメンションが並ぶ。
    */
    const respondents = await prisma.preEventParticipant.findMany({
      where: { preEventId: preEvent.id },
      select: { userId: true, user: { select: USER_PUBLIC_SELECT } },
      distinct: ['userId'],
      orderBy: { createdAt: 'asc' },
    })

    const isOrganizer = await checkPreEventOrganizerPermission(preEvent.id, session.user.id)
    const hasResponded = respondents.some((r) => r.userId === session.user.id)
    if (!isOrganizer && !hasResponded) {
      throw ApiError.forbidden('この日程調整の回答者への連絡はできません')
    }

    /*
      直接投稿できるか。**主催者のときだけ調べる** — 投稿APIが主催者しか
      通さないので、回答者に「直接投稿」を選ばせると送信で弾かれる
      （選べるのに送ると失敗する選択肢を作らない）。
    */
    let canPostDirectly = false
    const platform = session.user.platform?.toLowerCase() ?? ''
    if (isOrganizer && DIRECT_POST_PLATFORMS.includes(platform)) {
      const dbUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { accessToken: true, hasWritePermission: true },
      })
      /*
        **`false` と分かっているときだけ「駄目」にする。** `null` は
        この列より前に入ったユーザーで、権限を持っているかもしれない。
        分からないうちは従来どおり送ってみて、断られたら入り直しへ案内する
        （`components/attendable/contact/post-errors.ts`）。
      */
      canPostDirectly =
        decryptAccessToken(dbUser?.accessToken) !== null && dbUser?.hasWritePermission !== false
    }

    return ok(
      serializePreEventContact({
        preEvent,
        respondents: respondents.map((r) => r.user),
        viewer: {
          platform: session.user.platform ?? '',
          server: session.user.server ?? '',
          // 投稿APIは主催者しか通さない。回答者に選ばせると送信で弾かれる
          mayPostDirectly: isOrganizer,
          canPostDirectly,
        },
      })
    )
  },
})
