'use client'

import * as React from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { ContactScreen } from '@/components/attendable/contact/ContactScreen'
import { ApiClientError } from '@/lib/api/client'
import { useEventContact, usePostEventMessage } from '@/lib/api/queries/events'
import { STORAGE_EVENT_CONTACT_DRAFT } from '@/lib/storage-keys'

/**
 * 参加者への連絡。
 *
 * **画面そのものは日程調整と共有している**（`ContactScreen`）。
 * ここは取得と、イベントに固有の宛先の作り方だけを担う —
 * イベントは参加状態で束ね、**既定は「参加予定の人」だけ**。
 * 欠席やキャンセルの人にも送りたいときは選び足す。
 */

/** 参加状態の呼び名。宛先のチップに出る */
const STATUS_LABEL: Record<string, string> = {
  attending: '参加予定',
  maybe: '未定',
  participation_request: '参加リクエスト中',
  not_attending: '欠席',
  cancelled: 'キャンセル',
}

export default function EventContactScreen({ eventId }: { eventId: string }) {
  const { data, isPending, error } = useEventContact(eventId)
  const post = usePostEventMessage(eventId)

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
            ? 'このイベントの参加者へは連絡できません。'
            : '連絡先を読み込めませんでした。'}
        </p>
      </div>
    )
  }

  const groups = data.groups.map((g) => ({
    id: g.status,
    label: STATUS_LABEL[g.status] ?? g.status,
    users: g.users,
  }))

  return (
    <ContactScreen
      id={eventId}
      backHref={`/events/${eventId}`}
      backLabel="イベントに戻る"
      heading="参加者への連絡"
      subject={data.event.title}
      targetUrl={`${window.location.origin}/events/${eventId}`}
      draftKey={STORAGE_EVENT_CONTACT_DRAFT}
      viewer={data.viewer}
      groups={groups}
      /*
        **既定は「参加予定の人」だけ。** 欠席やキャンセルの人まで最初から
        宛先に入れると、押し間違いで無関係の人を呼ぶことになる。
        参加予定が1人もいないときは、何も選ばれていない状態で始める
        （選ばれていないことは宛先の欄に出る）。
      */
      defaultGroupIds={groups.some((g) => g.id === 'attending') ? ['attending'] : []}
      unreachableCount={data.unreachableCount}
      unreachableNote="メンションで連絡する手段が無いため、宛先から外しています。Discord のサーバー内で直接伝えてください。"
      registrationDeadline={data.event.registrationDeadline}
      posting={post.isPending}
      onPost={(input) => post.mutateAsync(input)}
    />
  )
}
