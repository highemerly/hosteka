import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { ApiError } from '@/server/http/errors'
import { REPORT_DETAIL_SELECT } from '@/server/queries/admin-report'
import { serializeReportDetail, type ReportDetailDto } from '@/server/serializers/report'
import { idParam } from '@/schemas/admin'
import { updateReportBody } from '@/schemas/report'

export const GET = defineRoute({
  auth: 'admin',
  params: idParam,
  handler: async ({ params }): Promise<ReportDetailDto> => {
    const report = await prisma.report.findUnique({
      where: { id: params.id },
      select: REPORT_DETAIL_SELECT,
    })
    if (!report) throw ApiError.notFound('通報が見つかりません')
    return serializeReportDetail(report)
  },
})

/**
 * 通報の状態と対応メモを更新する。
 *
 * **送られなかった項目は触らない。** 旧画面は「未処理に戻す」で
 * `adminNote` を送らず、書いてあったメモが黙って消えていた。
 * メモを消したいときは `null`（または空文字）を明示して送る。
 *
 * **通報対象は削除しない。** 対象の無効化は
 * admin/events/[id]/disable などの専用操作で行う。
 */
export const PATCH = defineRoute({
  auth: 'admin',
  params: idParam,
  body: updateReportBody,
  handler: async ({ params, body }): Promise<ReportDetailDto> => {
    const report = await prisma.report.findUnique({
      where: { id: params.id },
      select: { id: true, status: true },
    })
    if (!report) throw ApiError.notFound('通報が見つかりません')

    const statusChanged = body.status !== undefined && body.status !== report.status

    const updated = await prisma.report.update({
      where: { id: params.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.adminNote !== undefined ? { adminNote: body.adminNote || null } : {}),
        // 解決した時刻は状態が変わったときだけ動かす。メモの保存で上書きしない
        ...(statusChanged
          ? { resolvedAt: body.status === 'resolved' ? new Date() : null }
          : {}),
      },
      select: REPORT_DETAIL_SELECT,
    })

    return serializeReportDetail(updated)
  },
})
