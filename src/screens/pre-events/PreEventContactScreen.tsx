'use client'

import * as React from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { ContactScreen } from '@/components/attendable/contact/ContactScreen'
import { ApiClientError } from '@/lib/api/client'
import { usePostPreEventMessage, usePreEventContact } from '@/lib/api/queries/pre-events'
import { STORAGE_PRE_EVENT_CONTACT_DRAFT } from '@/lib/storage-keys'

/**
 * 回答者への連絡。
 *
 * **画面そのものはイベントと共有している**（`ContactScreen`）。
 * ここは取得と、日程調整に固有の宛先の作り方だけを担う —
 * 日程調整は状態で分かれないので、束は「回答者全員」の1つだけ。
 */
export default function PreEventContactScreen({ preEventId }: { preEventId: string }) {
  const { data, isPending, error } = usePreEventContact(preEventId)
  const post = usePostPreEventMessage(preEventId)

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  if (error || !data) {
    const forbidden = error instanceof ApiClientError && error.status === 403
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {forbidden
            ? 'この日程調整の回答者へは連絡できません。'
            : '連絡先を読み込めませんでした。'}
        </p>
      </div>
    )
  }

  return (
    <ContactScreen
      id={preEventId}
      backHref={`/pre-events/${preEventId}`}
      backLabel="日程調整に戻る"
      heading="回答者への連絡"
      subject={data.preEvent.title}
      targetUrl={`${window.location.origin}/pre-events/${preEventId}`}
      draftKey={STORAGE_PRE_EVENT_CONTACT_DRAFT}
      viewer={data.viewer}
      groups={[{ id: 'all', label: '回答者全員', users: data.respondents }]}
      defaultGroupIds={['all']}
      unreachableCount={data.unreachableCount}
      unreachableNote="メンションで連絡する手段が無いため、宛先から外しています。Discord のサーバー内で直接伝えてください。"
      registrationDeadline={data.preEvent.registrationDeadline}
      posting={post.isPending}
      onPost={(input) => post.mutateAsync(input)}
    />
  )
}
