import { prisma } from '@/lib/prisma'
import { parseUserHandle } from '@/lib/user-handle'
import { userHandleParam } from '@/schemas/user'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'

/**
 * 連絡先のメールアドレス。
 *
 * **公開プロフィール（`../route.ts`）には絶対に載せない。** 載せると、
 * 未ログインのクローラーが一覧ページを舐めるだけで収集できる。
 * 別のルートに分けてあるのは、`auth: 'required'` を型で強制するため
 * （同じハンドラの中で「ログインしているときだけ足す」と書くと、
 * 足し忘れではなく**消し忘れ**で漏れる）。
 *
 * **一括で取れる口は作らないこと。** 一覧の応答に `email` を混ぜない。
 * 公開プロフィールが返すのは `hasEmail`（登録の有無）までにとどめる。
 */
export type UserEmailDto = { email: string | null }

export const GET = defineRoute({
  auth: 'required',
  params: userHandleParam,
  handler: async ({ params }): Promise<UserEmailDto> => {
    const handle = parseUserHandle(params.handle)
    if (!handle) throw ApiError.notFound('ユーザーが見つかりません')

    const user = await prisma.user.findUnique({
      where: { username_server: handle },
      // 停止されている人のページは公開側で 404 なので、ここでも返さない
      select: { email: true, ban: { select: { id: true } } },
    })

    if (!user || user.ban) throw ApiError.notFound('ユーザーが見つかりません')

    return { email: user.email }
  },
})
