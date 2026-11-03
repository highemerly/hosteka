import { decryptAccessToken } from '@/lib/crypto'
import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { remoteFetch } from '@/server/remote-fetch'

/**
 * 自分の予約投稿（`/dashboard/scheduled_post`）。
 *
 * **ブラウザから相手のサーバーを直接叩かない。** そうするには
 * アクセストークンをブラウザへ渡すことになり、RSC ペイロード（＝HTML）に
 * 載れば**ページを見た誰でも読める。** ここで代理して、トークンをサーバーから出さない。
 */

/** Mastodon が返す予約投稿のうち、画面が使うものだけ */
export type ScheduledPostDto = {
  id: string
  scheduledAt: string
  text: string
  visibility: string
  /** 添付の数。中身は出さない（一覧で見るものではない） */
  mediaCount: number
}

/**
 * 取得の結果。
 *
 * **「取れなかった」を種類で返す。** エラーコードに混ぜると、画面が
 * 「入り直せば直る」のか「そもそも使えない」のかを判別できない。
 */
export type ScheduledPostsDto =
  | { status: 'ok'; server: string; posts: ScheduledPostDto[] }
  /** Mastodon 以外のアカウント。予約投稿の仕組みが無い */
  | { status: 'not_mastodon' }
  /** 投稿の権限が無い（トークンが無い、または相手が 403 を返した） */
  | { status: 'no_write_permission'; server: string }

/**
 * 一度に読む件数。
 *
 * **ページ送りは持たない。** Mastodon の `scheduled_statuses` は
 * `offset` を受け付けない（旧画面は `offset` を送っていて、
 * 「次のページ」を押しても同じ一覧が返っていた）。
 * 予約投稿はリマインダー数件で、40件あれば実用上足りる。
 */
const LIMIT = 40

type MastodonScheduledStatus = {
  id: string
  scheduled_at: string
  params?: { text?: string; visibility?: string }
  media_attachments?: unknown[]
}

export const GET = defineRoute({
  auth: 'required',
  handler: async ({ session }): Promise<ScheduledPostsDto> => {
    if (session.user.platform !== 'mastodon') return { status: 'not_mastodon' }

    const server = session.user.server
    const dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { accessToken: true },
    })
    const accessToken = decryptAccessToken(dbUser?.accessToken)
    if (!accessToken || !server) return { status: 'no_write_permission', server: server ?? '' }

    let response: Response
    try {
      response = await remoteFetch(
        `https://${server}/api/v1/scheduled_statuses?limit=${LIMIT}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
    } catch {
      // 相手のサーバーが落ちている・名前が引けない。こちらの不具合ではない
      throw ApiError.serviceUnavailable(`${server} に接続できませんでした`)
    }

    // トークンはあるが権限が足りない。入り直せば直るので、そう言えるようにする
    if (response.status === 401 || response.status === 403) {
      return { status: 'no_write_permission', server }
    }
    if (!response.ok) {
      throw ApiError.serviceUnavailable(`${server} から予約投稿を取得できませんでした`)
    }

    const raw = (await response.json()) as MastodonScheduledStatus[]

    return {
      status: 'ok',
      server,
      posts: raw.map((post) => ({
        id: post.id,
        scheduledAt: post.scheduled_at,
        text: post.params?.text ?? '',
        visibility: post.params?.visibility ?? 'public',
        mediaCount: post.media_attachments?.length ?? 0,
      })),
    }
  },
})
