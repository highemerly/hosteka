import { defineRoute } from '@/server/http/define-route'
import { eventPostScheduledBody } from '@/schemas/contact'
import { ApiError } from '@/server/http/errors'
import { hideDisabledFromNonAdmins } from '@/server/http/guards'
import { checkEventContactPermission } from '@/lib/permissions'
import { ok } from '@/server/http/response'
import { prisma } from '@/lib/prisma'
import { decryptAccessToken } from '@/lib/crypto'
import { isPermissionStatus } from '@/lib/posting'
import { remoteFetch } from '@/server/remote-fetch'

export const POST = defineRoute({
  auth: 'required',
  body: eventPostScheduledBody,
  handler: async ({ body, session }) => {
    const { eventId, message, scheduledFor, visibility = 'public' } = body

    if (!eventId || !message || !scheduledFor) {
      throw ApiError.validation('本文と予約日時を入力してください')
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
    if (!accessToken || !session.user.server) {
      throw ApiError.validation(
        'この操作には投稿の権限が必要です。投稿権限を付与して再ログインしてください'
      )
    }

    // scheduled_atの時刻をISO8601形式に変換
    const scheduledAt = new Date(scheduledFor).toISOString()

    const mastodonResponse = await remoteFetch(`https://${session.user.server}/api/v1/statuses`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: message,
        scheduled_at: scheduledAt,
        visibility: visibility
      })
    }).catch(() => {
      throw ApiError.serviceUnavailable(`${session.user.server} に接続できませんでした`)
    })

    if (!mastodonResponse.ok) {
      const error = await mastodonResponse.text()
      console.error('Mastodon scheduled post failed:', error)
      /*
        **権限で断られたことだけは機械可読にする。** 入り直せば直るので、
        画面は再ログインへ案内できなければならない。文言の一致で
        見分けると、相手のサーバーの文言が変わったときに黙って壊れる。
      */
      if (isPermissionStatus(mastodonResponse.status)) {
        throw ApiError.forbidden(
          'Mastodon への予約投稿が権限不足で断られました。投稿権限を付与して再ログインしてください'
        ).withDetails([{ path: 'writePermission', message: error || '原因は不明です' }])
      }
      throw ApiError.serviceUnavailable('Mastodon への予約投稿に失敗しました').withDetails([
        { path: 'scheduledFor', message: error || '原因は不明です' },
      ])
    }

    const scheduledStatus = await mastodonResponse.json()

    return ok({ scheduledStatusId: scheduledStatus.id, scheduledFor: scheduledAt })

  },
})