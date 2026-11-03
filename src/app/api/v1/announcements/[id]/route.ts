import { isPublished } from '@/lib/announcements'
import { prisma } from '@/lib/prisma'
import { announcementIdParam } from '@/schemas/announcement'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { ANNOUNCEMENT_SELECT } from '@/server/queries/announcement'
import { serializeAnnouncement, type AnnouncementDto } from '@/server/serializers/announcement'

/**
 * お知らせ1件。
 *
 * **本文が無いものは 404。** 詳細ページは本文を読ませるためにあるので、
 * 題名しか出ない行へ導線を作らない（一覧も本文のあるものだけリンクにする）。
 *
 * **公開前のものも 404。** 予約の存在ごと隠す。
 *
 * 公開キャッシュには載せない。id ごとに URL が散るので CDN に持たせても
 * 当たらないうえ、`next.config.ts` の除外の書き方が動的セグメントを
 * 素直に書けない。
 */
export const GET = defineRoute({
  auth: 'none',
  params: announcementIdParam,
  handler: async ({ params }): Promise<AnnouncementDto> => {
    const row = await prisma.announcement.findUnique({
      where: { id: params.id },
      select: ANNOUNCEMENT_SELECT,
    })
    if (!row) throw ApiError.notFound('お知らせが見つかりません')

    const announcement = serializeAnnouncement(row)
    if (!announcement.body || !isPublished(announcement, Date.now())) {
      throw ApiError.notFound('お知らせが見つかりません')
    }

    return announcement
  },
})
