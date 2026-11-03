import { z } from 'zod'

import { decryptAccessToken } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { remoteFetch } from '@/server/remote-fetch'

const params = z.object({ id: z.string().trim().min(1) })

/**
 * 予約投稿を1つ取り消す。
 *
 * 一覧と同じく**サーバーが代理で叩く**。トークンをブラウザへ出さない。
 */
export const DELETE = defineRoute({
  auth: 'required',
  params,
  handler: async ({ params, session }) => {
    const server = session.user.server
    if (session.user.platform !== 'mastodon' || !server) {
      throw ApiError.forbidden('この操作は Mastodon のアカウントでのみ行えます')
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { accessToken: true },
    })
    const accessToken = decryptAccessToken(dbUser?.accessToken)
    if (!accessToken) {
      throw ApiError.forbidden('投稿権限が必要です。再ログインして権限を付与してください')
    }

    let response: Response
    try {
      response = await remoteFetch(`https://${server}/api/v1/scheduled_statuses/${params.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    } catch {
      throw ApiError.serviceUnavailable(`${server} に接続できませんでした`)
    }

    if (response.status === 401 || response.status === 403) {
      throw ApiError.forbidden('投稿権限が必要です。再ログインして権限を付与してください')
    }
    // 既に消えている・投稿済み。**成功として扱う**（画面から消えるのが目的）
    if (response.status === 404) return { deleted: true }
    if (!response.ok) {
      throw ApiError.serviceUnavailable(`${server} で取り消せませんでした`)
    }

    return { deleted: true }
  },
})
