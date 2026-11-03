import type { MetadataRoute } from 'next'

import { getBaseUrl } from '@/lib/base-url'
import { prisma } from '@/lib/prisma'
import { PUBLIC_EVENT_CONDITIONS } from '@/server/queries/event-list'
import { PUBLIC_PRE_EVENT_CONDITIONS } from '@/server/queries/pre-event-list'

/**
 * sitemap.xml。
 *
 * **リクエスト時に組み立てる。** `NEXTAUTH_URL` はビルド時には無いので
 * （Dockerfile が渡していない）、静的に焼くと全URLが
 * `http://localhost:3000` になる。クローラーが来る回数は誤差なので、
 * 毎回引いてよい。
 */
export const dynamic = 'force-dynamic'

/**
 * 載せる件数の上限。
 *
 * sitemap の仕様上は5万件まで置けるが、**1ファイルに全部書くのはここまで**。
 * これを超えたら分割（`generateSitemaps`）へ移すこと。
 */
const LIMIT = 2000

/** 読み物ページ。更新頻度が低いので優先度は下げる */
const CONTENT_PATHS = [
  '/faq',
  '/feature',
  '/markdown-guide',
  '/release-notes',
  '/announcements',
  '/terms',
  '/privacy',
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getBaseUrl()
  const now = new Date()

  /*
    載せるのは**公開一覧に出ているものだけ。** 公開条件は一覧と共有する
    （`PUBLIC_*_CONDITIONS`）。ここに条件を書き写すと、一覧には出ないのに
    sitemap 経由で索引される、が起きる。

    終わったものは載せない。クローラーに「もう参加できないページ」を
    優先して読ませる意味がない。
  */
  const [events, preEvents, announcements] = await Promise.all([
    prisma.event.findMany({
      where: {
        AND: [
          ...PUBLIC_EVENT_CONDITIONS,
          { status: { not: 'cancelled' } },
          {
            OR: [
              { endDate: { gte: now } },
              { AND: [{ endDate: null }, { startDate: { gte: now } }] },
            ],
          },
        ],
      },
      select: { id: true, updatedAt: true },
      orderBy: { startDate: 'asc' },
      take: LIMIT,
    }),
    prisma.preEvent.findMany({
      where: {
        AND: [
          ...PUBLIC_PRE_EVENT_CONDITIONS,
          // 日程調整に開催日は無い。未来の候補が残っているかで判定する
          { dateOptions: { some: { startDate: { gte: now } } } },
        ],
      },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: LIMIT,
    }),
    /*
      お知らせは**本文のあるものだけ**。本文が無いものに詳細ページは無い
      （一覧が題名だけを出す）ので、載せると404を読ませることになる。
    */
    prisma.announcement.findMany({
      where: { publishedAt: { lte: now }, body: { not: null } },
      select: { id: true, updatedAt: true },
      orderBy: { publishedAt: 'desc' },
      take: LIMIT,
    }),
  ])

  return [
    { url: base, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/events`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/pre-events`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    ...CONTENT_PATHS.map((path) => ({
      url: `${base}${path}`,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
    ...events.map((event) => ({
      url: `${base}/events/${event.id}`,
      lastModified: event.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    ...preEvents.map((preEvent) => ({
      url: `${base}/pre-events/${preEvent.id}`,
      lastModified: preEvent.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...announcements.map((announcement) => ({
      url: `${base}/announcements/${announcement.id}`,
      lastModified: announcement.updatedAt,
      changeFrequency: 'monthly' as const,
      priority: 0.3,
    })),
  ]
}
