import { defineRoute } from '@/server/http/define-route'
import { eventPostImmediateBody } from '@/schemas/contact'
import { ApiError } from '@/server/http/errors'
import { hideDisabledFromNonAdmins } from '@/server/http/guards'
import { checkEventContactPermission } from '@/lib/permissions'
import { ok } from '@/server/http/response'
import { prisma } from '@/lib/prisma'
import { decryptAccessToken } from '@/lib/crypto'
import { postToMastodon, postToMisskey } from '@/lib/posting'
import type { PostVisibility, UserCredentials } from '@/lib/posting'

/**
 * 投稿できなかったときのエラー。
 *
 * **権限で断られたことだけは機械可読にする。** 入り直せば直るものなので、
 * 画面は再ログインへ案内できなければならない。旧実装はエラーの文言を
 * 「権限」「403」で文字列マッチしていた（相手のサーバーの文言が変われば
 * 黙って壊れる）。`details` の `path` で見分ける。
 */
function postFailure(platform: string, result: { error?: string; kind?: string }): ApiError {
  const name = platform === 'misskey' ? 'Misskey' : 'Mastodon'
  const reason = result.error ?? '原因は不明です'

  if (result.kind === 'permission') {
    return ApiError.forbidden(
      `${name} への投稿が権限不足で断られました。投稿権限を付与して再ログインしてください`
    ).withDetails([{ path: 'writePermission', message: reason }])
  }
  // 相手のサーバーが断った。Hosteka の不具合ではない
  return ApiError.serviceUnavailable(`${name} への投稿に失敗しました`).withDetails([
    { path: 'message', message: reason },
  ])
}

export const POST = defineRoute({
  auth: 'required',
  body: eventPostImmediateBody,
  handler: async ({ body, session }) => {
    const { eventId, message, participantIds, visibility = 'public' } = body

    if (!eventId || !message || !participantIds?.length) {
      throw ApiError.validation('宛先と本文を指定してください')
    }

    // イベントの存在確認と権限チェック
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        participants: {
          include: {
            user: {
              select: { id: true },
            },
          },
        }
      }
    })

    if (!event) {
      throw ApiError.notFound('イベントが見つかりません')
    }
    await hideDisabledFromNonAdmins(event.isDisabled, session, 'イベントが見つかりません')

    // 主催者・幹事・グループのメンバー・参加者のみ（`checkEventContactPermission`）
    if (!(await checkEventContactPermission(event.id, session.user.id))) {
      throw ApiError.forbidden('このイベントの参加者への連絡はできません')
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
    const credentials: UserCredentials = { server: session.user.server, accessToken }

    // プラットフォームに応じた投稿
    const platform = session.user.platform?.toLowerCase() || 'mastodon'
    let postResponse: { success: boolean; postId?: string; error?: string }

    if (platform === 'misskey') {
      postResponse = await postToMisskey(credentials, message, visibility as PostVisibility)
    } else {
      postResponse = await postToMastodon(credentials, message, visibility as PostVisibility)
    }

    if (!postResponse.success) {
      throw postFailure(platform, postResponse)
    }

    return ok({ postId: postResponse.postId, participantCount: participantIds.length })

  },
})
