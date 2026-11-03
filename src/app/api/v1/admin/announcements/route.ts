import { prisma } from '@/lib/prisma'
import { adminAnnouncementsQuery, announcementBody } from '@/schemas/announcement'
import { announcementColumnsFromBody } from '@/server/announcements/columns'
import { defineRoute } from '@/server/http/define-route'
import { created, makeMeta, okList } from '@/server/http/response'
import { ANNOUNCEMENT_SELECT } from '@/server/queries/announcement'
import { serializeAnnouncement, type AnnouncementDto } from '@/server/serializers/announcement'

/**
 * お知らせの一覧（管理者）。
 *
 * 公開側（`/api/v1/announcements`）と違い、**予約中のものも掲載の
 * 終わったものも返す。** 管理画面は「これから出るもの」を確かめる場所でもある。
 */
export const GET = defineRoute({
  auth: 'admin',
  query: adminAnnouncementsQuery,
  handler: async ({ query }) => {
    const [rows, total] = await Promise.all([
      prisma.announcement.findMany({
        select: ANNOUNCEMENT_SELECT,
        orderBy: { publishedAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.announcement.count(),
    ])

    return okList(rows.map(serializeAnnouncement), makeMeta(total, query.page, query.perPage))
  },
})

/**
 * お知らせを作る。
 *
 * **通知（`notifications`）は出さない。** あちらは一人ひとりに宛てた
 * 出来事の記録で、全員への掲示を人数分の行にすると、通知の一覧が
 * 運営の告知で埋まる。全員に届ける手段はバナーのほう。
 */
export const POST = defineRoute({
  auth: 'admin',
  body: announcementBody,
  handler: async ({ body }) => {
    const row = await prisma.announcement.create({
      data: announcementColumnsFromBody(body),
      select: ANNOUNCEMENT_SELECT,
    })
    return created<AnnouncementDto>(serializeAnnouncement(row))
  },
})
