import { defineRoute } from '@/server/http/define-route'
import { preEventPostScheduledBody } from '@/schemas/contact'
import { ApiError } from '@/server/http/errors'
import { hideDisabledFromNonAdmins } from '@/server/http/guards'
import { ok } from '@/server/http/response'
import { preEventIdParam } from '@/schemas/pre-event'
import { prisma } from '@/lib/prisma'
import { scheduleToMastodon } from '@/lib/posting'
import type { PostVisibility } from '@/lib/posting'
import { decryptAccessToken } from '@/lib/crypto'
import { checkPreEventOrganizerPermission } from '@/lib/permissions'

export const POST = defineRoute({
  auth: 'required',
  params: preEventIdParam,
  body: preEventPostScheduledBody,
  handler: async ({ params, body, session }) => {
    const id = params.id
    const { message, scheduledFor, visibility = 'public' } = body

    if (!message || !scheduledFor) {
      throw ApiError.validation('本文と予約日時を入力してください')
    }

    // Mastodonユーザーのみ予約投稿が可能
    const platform = session.user.platform?.toLowerCase() || 'mastodon'
    if (platform !== 'mastodon') {
      throw ApiError.validation('予約投稿に対応しているのは Mastodon だけです')
    }

    // 日程調整の存在確認と権限チェック
    const preEvent = await prisma.preEvent.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true },
        },
      }
    })

    if (!preEvent) {
      throw ApiError.notFound('日程調整が見つかりません')
    }
    await hideDisabledFromNonAdmins(preEvent.isDisabled, session, '日程調整が見つかりません')

    // 作成者・グループのメンバー（管理責任者・スタッフ）のみ
    if (!(await checkPreEventOrganizerPermission(preEvent.id, session.user.id))) {
      throw ApiError.forbidden('この日程調整の回答者への連絡はできません')
    }

    // アクセストークンをDBから取得
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { accessToken: true }
    })
    const accessToken = decryptAccessToken(dbUser?.accessToken)
    if (!accessToken || !session.user.server) {
      throw ApiError.validation(
        'この操作には投稿の権限が必要です。投稿権限を付与して再ログインしてください'
      )
    }

    const userCredentials = {
      server: session.user.server,
      accessToken
    }

    const postResponse = await scheduleToMastodon(
      userCredentials,
      message,
      scheduledFor,
      visibility as PostVisibility
    )

    if (!postResponse.success) {
      console.error('Mastodon scheduled post failed:', postResponse.error)
      const reason = postResponse.error ?? '原因は不明です'
      // 権限で断られたことだけは機械可読にする（入り直せば直る）
      if (postResponse.kind === 'permission') {
        throw ApiError.forbidden(
          'Mastodon への予約投稿が権限不足で断られました。投稿権限を付与して再ログインしてください'
        ).withDetails([{ path: 'writePermission', message: reason }])
      }
      throw ApiError.serviceUnavailable('Mastodon への予約投稿に失敗しました').withDetails([
        { path: 'scheduledFor', message: reason },
      ])
    }

    return ok({
      scheduledStatusId: postResponse.scheduledStatusId,
      scheduledFor: postResponse.scheduledFor,
    })

  },
})
