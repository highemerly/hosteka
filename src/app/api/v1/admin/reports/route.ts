import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { REPORT_LIST_SELECT } from '@/server/queries/admin-report'
import { serializeReport } from '@/server/serializers/report'
import { listReportsQuery } from '@/schemas/report'

/** 通報一覧（管理者）。管理系の通報APIはこちらに一本化している */
export const GET = defineRoute({
  auth: 'admin',
  query: listReportsQuery,
  handler: async ({ query }) => {
    const where = query.status === 'all' ? {} : { status: query.status }

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        select: REPORT_LIST_SELECT,
        orderBy: { reportedAt: 'desc' },
        skip: (query.page - 1) * query.perPage,
        take: query.perPage,
      }),
      prisma.report.count({ where }),
    ])

    return okList(reports.map(serializeReport), makeMeta(total, query.page, query.perPage))
  },
})
