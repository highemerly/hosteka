import { z } from 'zod'

import { prisma } from '@/lib/prisma'
import { normalizeSlug } from '@/lib/normalize'
import { defineRoute } from '@/server/http/define-route'

/**
 * グループIDの重複チェック。
 *
 * 無認証のままにしてある（グループ作成フォームがログイン前段階でも叩くため）。
 * 返すのは available の真偽のみで、既存グループの情報は一切出さない。
 */
export const GET = defineRoute({
  auth: 'none',
  query: z.object({
    slug: z.string().min(1, 'グループIDを指定してください'),
    /** 編集時に自分自身を除外する */
    exclude: z.string().optional(),
  }),
  handler: async ({ query }) => {
    const normalizedSlug = normalizeSlug(query.slug)
    const existing = await prisma.organization.findUnique({
      where: { slug: normalizedSlug },
      select: { slug: true },
    })

    // Boolean() が必要: exclude が未指定のとき `undefined && ...` は undefined を
    // 返し、available が false ではなく null/undefined になる。消費側の OrgFormScreen は
    // `slugAvailable === false` で送信ボタンの無効化やエラー表示を判定しているため、
    // false 以外だとそれらがすべて素通りする（使用中のIDでも送信できてしまう）。
    const available = Boolean(
      !existing || (query.exclude && existing.slug === normalizeSlug(query.exclude))
    )

    return { available }
  },
})
