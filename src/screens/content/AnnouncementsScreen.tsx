'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

import { AnnouncementTypeIcon } from '@/components/content/AnnouncementTypeIcon'
import { ContentPage } from '@/components/content/ContentPage'
import { Skeleton } from '@/components/ui/skeleton'
import { useAnnouncements } from '@/lib/api/queries/announcements'
import { formatJstDate } from '@/lib/jst'
import type { AnnouncementDto } from '@/server/serializers/announcement'

/**
 * お知らせの一覧。
 *
 * **本文のあるものだけリンクにする。** 題名1行で終わるお知らせの詳細ページを
 * 開かせても、同じ題名がもう一度出るだけになる。
 */
export default function AnnouncementsScreen() {
  const { data, isPending, error } = useAnnouncements()

  return (
    <ContentPage title="お知らせ">
      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          読み込めませんでした。時間をおいて開き直してください。
        </p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">現在お知らせはありません。</p>
      ) : (
        <ul className="rule-y">
          {data.items.map((announcement) => (
            <li key={announcement.id}>
              <AnnouncementRow announcement={announcement} />
            </li>
          ))}
        </ul>
      )}
    </ContentPage>
  )
}

function AnnouncementRow({ announcement }: { announcement: AnnouncementDto }) {
  const body = (
    <>
      <AnnouncementTypeIcon type={announcement.type} className="size-3.5 self-center" />
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
        {formatJstDate(announcement.publishedAt)}
      </span>
      <span className="min-w-0 flex-1 text-sm text-foreground">{announcement.title}</span>
    </>
  )

  if (!announcement.body) {
    return <div className="flex items-baseline gap-3 py-3">{body}</div>
  }

  return (
    // 行全体を的にする。日付だけを押しても開かない、を作らない
    <Link
      href={`/announcements/${announcement.id}`}
      className="flex items-baseline gap-3 py-3 transition-colors hover:text-primary"
    >
      {body}
      <ChevronRight className="size-4 shrink-0 self-center text-muted-foreground" aria-hidden />
    </Link>
  )
}
