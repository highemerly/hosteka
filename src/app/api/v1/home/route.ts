import { prisma } from '@/lib/prisma'
import { defineRoute } from '@/server/http/define-route'
import { EVENT_LIST_SELECT } from '@/server/queries/event-list'
import {
  HOME_FEATURED_POOL,
  HOME_FEATURED_WHERE,
  rankFeatured,
} from '@/server/queries/home-featured'
import { serializeEventListItem, type EventListItemDto } from '@/server/serializers/event'

/**
 * トップページの中身。
 *
 * **`auth: 'none'`。** 応答は全閲覧者で同一なので、CDN にそのまま載る。
 * ここでセッションを見ると（「あなたの参加予定」などを足すと）ページごと
 * キャッシュできなくなり、トップページを静的にした意味が消える。
 *
 * 以前はトップページ自身が `force-dynamic` で prisma を直に叩いていた。
 * 登録数などの統計も返していたが、画面から実績の節を外したので落とした
 * （表示しない数字のために毎回 COUNT を4本引いていた）。
 */

export type HomeDto = {
  /** 看板に流すイベント。並びは `rankFeatured` が決める */
  featured: EventListItemDto[]
}

export const GET = defineRoute({
  auth: 'none',
  /*
    **HTML だけ CDN に載せても、データが載らなければ意味が薄い。**
    ページを静的にしても、この応答が毎回オリジンまで来ればDBを引く。
    誰が来ても同じものを返すので、そのまま公開キャッシュに置ける。

    ページHTMLの 30分（`proxy.ts`）より短くしてある。中身のほうが動くため、
    新しいイベントは5分で看板に出る。
  */
  publicCache: { sMaxAge: 300, staleWhileRevalidate: 600 },
  handler: async () => {
    const pool = await prisma.event.findMany({
      where: HOME_FEATURED_WHERE,
      select: EVENT_LIST_SELECT,
      /*
        点数は `now` に依存するので DB では並べ替えられない（home-featured.ts）。
        多めに読んでから絞るが、**読む順は決め打ちにする** —
        未指定だと母集合が入れ替わったときに毎回違うものが載る。
      */
      orderBy: { startDate: 'desc' },
      take: HOME_FEATURED_POOL,
    })

    const dto: HomeDto = {
      featured: rankFeatured(pool, new Date()).map(serializeEventListItem),
    }

    return dto
  },
})
