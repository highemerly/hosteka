import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'

/**
 * 管理画面のトップ（`/admin`）。各一覧への入口に添える件数だけを返す。
 *
 * **旧トップは「最近のイベント」「最近の新規ユーザー」を5件ずつ並べていた。**
 * どちらも各一覧を新しい順で開けば先頭に出るもので、入口の画面で
 * 同じものをもう一度読ませる理由が無い。件数だけを残した。
 */
export type AdminOverviewDto = {
  /** 未処理の通報。**これだけは「対応が要る数」**で、ほかは総数 */
  pendingReports: number
  events: number
  preEvents: number
  users: number
  orgs: number
  announcements: number
}

export const GET = defineRoute({
  auth: 'admin',
  handler: async (): Promise<AdminOverviewDto> => {
    const [pendingReports, events, preEvents, users, orgs, announcements] = await Promise.all([
      prisma.report.count({ where: { status: 'pending' } }),
      prisma.event.count(),
      prisma.preEvent.count(),
      prisma.user.count(),
      prisma.organization.count(),
      prisma.announcement.count(),
    ])

    return { pendingReports, events, preEvents, users, orgs, announcements }
  },
})
