import { defineRoute } from '@/server/http/define-route'
import { preEventPostImmediateBody } from '@/schemas/contact'
import { ApiError } from '@/server/http/errors'
import { hideDisabledFromNonAdmins } from '@/server/http/guards'
import { ok } from '@/server/http/response'
import { preEventIdParam } from '@/schemas/pre-event'
import { prisma } from '@/lib/prisma'
import { postToMastodon, postToMisskey } from '@/lib/posting'
import type { PostResult, PostVisibility } from '@/lib/posting'
import { decryptAccessToken } from '@/lib/crypto'
import { checkPreEventOrganizerPermission } from '@/lib/permissions'

export const POST = defineRoute({
  auth: 'required',
  params: preEventIdParam,
  body: preEventPostImmediateBody,
  handler: async ({ params, body, session }) => {
    const id = params.id
    const { message, visibility = 'public' } = body

    if (!message) {
      throw ApiError.validation('本文を入力してください')
    }

    // 日程調整の存在確認と権限チェック
    const preEvent = await prisma.preEvent.findUnique({
      where: { id },
      include: {
        creator: {
          select: { id: true },
        },
        participants: {
          select: { userId: true },
          distinct: ['userId'],
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
    if (!accessToken) {
      throw ApiError.validation(
        'この操作には投稿の権限が必要です。投稿権限を付与して再ログインしてください'
      )
    }

    // プラットフォームに応じた投稿
    const platform = session.user.platform?.toLowerCase() || 'mastodon'
    const userCredentials = {
      server: session.user.server || '',
      accessToken
    }

    let postResponse: PostResult

    if (platform === 'misskey') {
      postResponse = await postToMisskey(userCredentials, message, visibility as PostVisibility)
    } else {
      postResponse = await postToMastodon(userCredentials, message, visibility as PostVisibility)
    }

    if (!postResponse.success) {
      const name = platform === 'misskey' ? 'Misskey' : 'Mastodon'
      const reason = postResponse.error ?? '原因は不明です'
      /*
        **権限で断られたことだけは機械可読にする。** 入り直せば直るので、
        画面は再ログインへ案内できなければならない（`details` の `path`）。
        それ以外は相手のサーバーが断ったということ。Hosteka の不具合ではない。
      */
      if (postResponse.kind === 'permission') {
        throw ApiError.forbidden(
          `${name} への投稿が権限不足で断られました。投稿権限を付与して再ログインしてください`
        ).withDetails([{ path: 'writePermission', message: reason }])
      }
      throw ApiError.serviceUnavailable(`${name} への投稿に失敗しました`).withDetails([
        { path: 'message', message: reason },
      ])
    }

    // 回答者数を取得（ユニークユーザー数）
    const uniqueParticipantIds = new Set(preEvent.participants.map(p => p.userId))
    const participantCount = uniqueParticipantIds.size

    return ok({ postId: postResponse.postId, participantCount })

  },
})
