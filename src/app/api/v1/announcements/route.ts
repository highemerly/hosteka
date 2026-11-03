import { bannerAnnouncements, listedAnnouncements } from '@/lib/announcements'
import { prisma } from '@/lib/prisma'
import { publicAnnouncementsQuery } from '@/schemas/announcement'
import { defineRoute } from '@/server/http/define-route'
import { makeMeta, okList } from '@/server/http/response'
import { ANNOUNCEMENT_SELECT } from '@/server/queries/announcement'
import { serializeAnnouncement } from '@/server/serializers/announcement'

/**
 * 公開中のお知らせ。一覧画面とヘッダー下のバナーの両方がここを見る。
 *
 * **誰が来ても同じものを返すので公開キャッシュに置ける。** バナーは
 * 全ページに出るので、匿名の閲覧者が1ページ開くたびに1本増える。
 * CDN が持てば DB には届かない。
 *
 * **持たせる秒数は短くする。** 掲載を降ろす判定は時刻で動くので、
 * 長く持たせるとその分だけ「もう終わったお知らせ」が出続ける。
 */

/** 一度に返す上限。お知らせは年に数件なので、これでページ送りが要らない */
const LIMIT = 100

export const GET = defineRoute({
  auth: 'none',
  query: publicAnnouncementsQuery,
  publicCache: { sMaxAge: 60, staleWhileRevalidate: 300 },
  handler: async ({ query }) => {
    const now = new Date()

    /*
      **予約分は取らない**（`publishedAt <= now`）。取ってから画面で隠すと、
      公開前の題名と本文が匿名の閲覧者へ配られる。
    */
    const rows = await prisma.announcement.findMany({
      where: { publishedAt: { lte: now } },
      select: ANNOUNCEMENT_SELECT,
      orderBy: { publishedAt: 'desc' },
      take: LIMIT,
    })

    const all = rows.map(serializeAnnouncement)
    const items =
      query.placement === 'banner'
        ? bannerAnnouncements(all, now.getTime())
        : listedAnnouncements(all, now.getTime())

    return okList(items, makeMeta(items.length, 1, LIMIT))
  },
})
