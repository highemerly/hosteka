'use client'

import { notFound } from 'next/navigation'

import { AnnouncementTypeIcon } from '@/components/content/AnnouncementTypeIcon'
import { ContentPage } from '@/components/content/ContentPage'
import SafeMarkdown from '@/components/SafeMarkdown'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiClientError } from '@/lib/api/client'
import { useAnnouncement } from '@/lib/api/queries/announcements'
import { formatJstDate } from '@/lib/jst'

/**
 * お知らせ1件。
 *
 * 本文の無いものと公開前のものは API が 404 を返すので、ここも
 * 「見つかりません」を出す（予約の存在ごと隠す）。
 */
export default function AnnouncementScreen({ id }: { id: string }) {
  const { data, isPending, error } = useAnnouncement(id)

  if (error instanceof ApiClientError && error.code === 'NOT_FOUND') notFound()

  const back = { href: '/announcements', label: 'お知らせ一覧' }

  if (isPending) {
    return (
      <ContentPage title="お知らせ" back={back}>
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-5 rounded-lg" />
          ))}
        </div>
      </ContentPage>
    )
  }

  if (error) {
    return (
      <ContentPage title="お知らせ" back={back}>
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          読み込めませんでした。時間をおいて開き直してください。
        </p>
      </ContentPage>
    )
  }

  return (
    <ContentPage
      title={data.title}
      lead={
        <span className="inline-flex items-center gap-1.5">
          <AnnouncementTypeIcon type={data.type} className="size-3.5" />
          {formatJstDate(data.publishedAt)}
        </span>
      }
      back={back}
    >
      <SafeMarkdown>{data.body ?? ''}</SafeMarkdown>
    </ContentPage>
  )
}
