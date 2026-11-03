import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { revokeUserSessions } from '@/server/auth/session'

/**
 * ログイン中のセッション（`/account/sessions`）。
 *
 * **失効はできるが、削除はしない。** 行を消しても発行済みJWTは有効期限まで
 * 通る（失効キャッシュは `revokedAt` の入った行しか見ない。
 * CLAUDE.md の Session Management）。
 */

export type AccountSessionDto = {
  id: string
  /** いまこの画面を開いているセッションか。**取り消しの対象から外す** */
  current: boolean
  /** ログインした日時 */
  createdAt: string
  /**
   * 最後に使われた日時。**最大1時間に1回しか更新されない**
   * （書き込み増幅を避けるため。`server/auth/session-activity.ts`）。
   * いまの端末だけは、この応答を返した時刻。
   */
  lastUsedAt: string
  expiresAt: string
  /** 生の User-Agent。読める形にするのは画面側（`lib/user-agent.ts`） */
  userAgent: string | null
  ipAddress: string | null
  /**
   * ログインしたときの場所（Cloudflare の訪問者位置ヘッダ）。
   * **CF を通さない経路と、この列より前のセッションでは null。**
   * 国は ISO 3166-1 alpha-2（`T1` は Tor）、地域は英語名。
   */
  country: string | null
  region: string | null
}

export type AccountSessionsDto = {
  sessions: AccountSessionDto[]
  /**
   * この応答を作った時刻。**「約3日前」はこれと比べて出す。**
   * 端末の時計と比べると、ずれている人にだけ違う数字が出る
   */
  now: string
}

export const GET = defineRoute({
  auth: 'required',
  handler: async ({ session }): Promise<AccountSessionsDto> => {
    /*
      **有効なものだけ返す。** 失効済み・期限切れの行は残っているが、
      並べても利用者にできることが無い（一覧が長くなるほど
      「身に覚えのない行」を見つけにくくなる）。
    */
    const now = new Date()
    const rows = await prisma.session.findMany({
      where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: now } },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        userAgent: true,
        ipAddress: true,
        country: true,
        region: true,
      },
      orderBy: { lastUsedAt: 'desc' },
    })

    /*
      **いまの端末の最終利用は「いま」。** 列は最大1時間に1回しか進まないので、
      そのまま返すと、この画面を開いている端末に「1時間前」と出る。
      いちばん最近使われた端末でもあるので、並びも先頭へ寄せる。
    */
    const isCurrent = (row: { id: string }) => row.id === session.sessionId
    const ordered = [...rows.filter(isCurrent), ...rows.filter((row) => !isCurrent(row))]

    return {
      sessions: ordered.map((row) => ({
        id: row.id,
        current: isCurrent(row),
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: (isCurrent(row) ? now : row.lastUsedAt).toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        userAgent: row.userAgent,
        ipAddress: row.ipAddress,
        country: row.country,
        region: row.region,
      })),
      now: now.toISOString(),
    }
  },
})

/**
 * **この端末以外**をすべて失効させる。
 *
 * 自分のセッションまで切ると、押した直後にログイン画面へ飛ばされる。
 * ここを終わりにしたい人は素直にログアウトすればよいので、
 * 「全部」ではなく「ほかを全部」だけを用意する。
 */
export const DELETE = defineRoute({
  auth: 'required',
  handler: async ({ session }) => {
    const revoked = await revokeUserSessions(session.user.id, {
      exceptSessionId: session.sessionId,
    })
    return { revoked }
  },
})
