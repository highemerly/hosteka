import { prisma } from '@/lib/prisma'
import { announcementBody, announcementIdParam } from '@/schemas/announcement'
import { announcementColumnsFromBody } from '@/server/announcements/columns'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { ANNOUNCEMENT_SELECT } from '@/server/queries/announcement'
import { serializeAnnouncement, type AnnouncementDto } from '@/server/serializers/announcement'

/** 無ければ 404 にする。更新も削除も、先に在ることを確かめてから動かす */
async function mustExist(id: number): Promise<void> {
  const row = await prisma.announcement.findUnique({ where: { id }, select: { id: true } })
  if (!row) throw ApiError.notFound('お知らせが見つかりません')
}

/**
 * お知らせを直す。
 *
 * **送られた本文で全体を上書きする。** 編集画面は全項目を送り返してくるので、
 * 画面側で1項目でも運び忘れると、開いて保存しただけでその項目が消える。
 * それを防ぐのは往復テストのほう（`announcement-form-values.test.ts`）。
 */
export const PUT = defineRoute({
  auth: 'admin',
  params: announcementIdParam,
  body: announcementBody,
  handler: async ({ params, body }): Promise<AnnouncementDto> => {
    await mustExist(params.id)

    const row = await prisma.announcement.update({
      where: { id: params.id },
      data: announcementColumnsFromBody(body),
      select: ANNOUNCEMENT_SELECT,
    })
    return serializeAnnouncement(row)
  },
})

export const DELETE = defineRoute({
  auth: 'admin',
  params: announcementIdParam,
  handler: async ({ params }) => {
    await mustExist(params.id)
    await prisma.announcement.delete({ where: { id: params.id } })
    return { success: true }
  },
})
