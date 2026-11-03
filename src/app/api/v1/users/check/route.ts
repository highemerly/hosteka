import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { normalizeUsername, normalizeServer } from '@/lib/normalize'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { serializeUser } from '@/server/serializers/user'

/**
 * ユーザーの存在確認。
 *
 * **認証を必須にする。** 無認証で開けると、任意の username@server について
 * 登録の有無と id / avatar を返す列挙オラクルになる。
 * 呼び出し元はグループ管理者の追加フロー（認証済み）だけ。
 */
export const GET = defineRoute({
  auth: 'required',
  query: z.object({
    username: z.string().trim().min(1, 'ユーザー名を指定してください'),
    server: z.string().trim().min(1, 'サーバーを指定してください'),
  }),
  handler: async ({ query }) => {
    const user = await prisma.user.findUnique({
      where: {
        username_server: {
          username: normalizeUsername(query.username),
          server: normalizeServer(query.server),
        },
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        avatar: true,
        server: true,
        platform: true,
      },
    })

    if (!user) {
      throw ApiError.notFound(
        `ユーザー @${query.username}@${query.server} が見つかりません。このサービスに一度もログインしていないユーザーは追加できません。`
      )
    }

    return serializeUser(user)
  },
})
