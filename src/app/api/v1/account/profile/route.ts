import { prisma } from '@/lib/prisma'
import { updateProfileBody } from '@/schemas/user'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import type { UserSocialAccountDto } from '@/server/serializers/user'

/**
 * 設定画面が読み書きするプロフィール。
 *
 * **公開プロフィール（`/api/v1/users/[handle]`）とは別に持つ。** あちらは
 * 「公開してよい形」に絞った結果で、メールアドレスを含まない。公開API＋
 * メールAPIの2往復で編集画面を組むと、往復テストの対象DTOが2本に割れて
 * 「どちらかが欠けても気づけない」形になる。編集画面が見るDTOは1本にする。
 *
 * **パスにハンドルを置かない。** 対象は常にセッションの本人なので、
 * `/api/v1/account/` 配下に寄せれば「パスの人 == セッションの人」という
 * 権限判定そのものが要らなくなる（書き忘れる余地を消す）。
 */
export type AccountProfileDto = {
  bio: string | null
  email: string | null
  socialAccounts: UserSocialAccountDto[]
  homepageUrls: string[]
}

/** JSON を入れた Text 列を読む。壊れていても落とさない */
function parseArray<T>(raw: string | null, pick: (row: unknown) => T | null): T[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((row) => {
    const picked = pick(row)
    return picked === null ? [] : [picked]
  })
}

function toDto(user: {
  bio: string | null
  email: string | null
  socialAccounts: string | null
  homepageUrls: string | null
}): AccountProfileDto {
  return {
    bio: user.bio,
    email: user.email,
    socialAccounts: parseArray(user.socialAccounts, (row) => {
      if (typeof row !== 'object' || row === null) return null
      const { platform, username, server } = row as Record<string, unknown>
      if (typeof platform !== 'string' || typeof username !== 'string') return null
      return { platform, username, server: typeof server === 'string' ? server : '' }
    }),
    homepageUrls: parseArray(user.homepageUrls, (row) => (typeof row === 'string' ? row : null)),
  }
}

const PROFILE_SELECT = {
  bio: true,
  email: true,
  socialAccounts: true,
  homepageUrls: true,
} as const

export const GET = defineRoute({
  auth: 'required',
  handler: async ({ session }): Promise<AccountProfileDto> => {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: PROFILE_SELECT,
    })
    if (!user) throw ApiError.unauthenticated()
    return toDto(user)
  },
})

/**
 * **全体の置き換え（PUT）。** 部分更新にしていないので、本文に無い項目は
 * 消える。だからこそスキーマ側で全キーを必須にしてあり、
 * `toUpdateProfileBody` が項目を落とすと 400 で気づける。
 */
export const PUT = defineRoute({
  auth: 'required',
  body: updateProfileBody,
  handler: async ({ session, body }): Promise<AccountProfileDto> => {
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: {
        bio: body.bio,
        email: body.email,
        // 空配列は null で持つ。`[]` を入れても読み手には同じで、行が短くなる
        socialAccounts: body.socialAccounts.length ? JSON.stringify(body.socialAccounts) : null,
        homepageUrls: body.homepageUrls.length ? JSON.stringify(body.homepageUrls) : null,
      },
      select: PROFILE_SELECT,
    })
    return toDto(user)
  },
})
