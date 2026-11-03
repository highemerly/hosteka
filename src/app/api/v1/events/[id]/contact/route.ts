import { z } from 'zod'

import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { hideDisabledFromNonAdmins } from '@/server/http/guards'
import { checkEventContactPermission } from '@/lib/permissions'
import { ok } from '@/server/http/response'
import { prisma } from '@/lib/prisma'
import { USER_PUBLIC_SELECT } from '@/lib/select-presets'
import { decryptAccessToken } from '@/lib/crypto'
import { serializeEventContact } from '@/server/serializers/event'

/** 直接投稿できるプラットフォーム。ここ以外は外部サービスへ渡す */
const DIRECT_POST_PLATFORMS = ['mastodon', 'misskey']

/**
 * 連絡画面に要るものを1つにまとめて返す。
 *
 * **参加者なら誰でも開ける。** 投稿API（`/api/v1/events/post-immediate`）が
 * 参加者を通すので、それに合わせる。日程調整とは違うところ
 * （あちらは主催者だけが直接投稿できる）。
 *
 * **アクセストークンは返さない。** 直接投稿できるかどうかだけをここで
 * 判定して真偽値にする。画面はトークンを知る必要がない。
 */
export const GET = defineRoute({
  auth: 'required',
  params: z.object({ id: z.string().trim().min(1) }),
  handler: async ({ params, session }) => {
    const event = await prisma.event.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        title: true,
        isDisabled: true,
        creatorId: true,
        registrationDeadlineDate: true,
        registrationDeadlineTime: true,
        participants: {
          select: { userId: true, status: true, user: { select: USER_PUBLIC_SELECT } },
          orderBy: { createdAt: 'asc' },
        },
      },
    })
    if (!event) throw ApiError.notFound('イベントが見つかりません')
    await hideDisabledFromNonAdmins(event.isDisabled, session, 'イベントが見つかりません')

    if (!(await checkEventContactPermission(event.id, session.user.id))) {
      throw ApiError.forbidden('このイベントの参加者への連絡はできません')
    }

    const platform = session.user.platform?.toLowerCase() ?? ''
    let canPostDirectly = false
    if (DIRECT_POST_PLATFORMS.includes(platform)) {
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
      serializeEventContact({
        // 締切の合成はシリアライザに任せる（日付列と時刻列の2列）
        event,
        participants: event.participants,
        viewer: {
          platform: session.user.platform ?? '',
          server: session.user.server ?? '',
          // 投稿APIは参加者を通す。ここまで来られた時点で条件を満たしている
          mayPostDirectly: true,
          canPostDirectly,
        },
      })
    )
  },
})
