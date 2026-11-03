'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Skeleton } from '@/components/ui/skeleton'
import { EventDetailView, toParticipantViews } from '@/components/event/EventDetailView'
import { ReportDialog } from '@/components/report/ReportDialog'
import { resolveEventActionState } from '@/components/event/resolveActionState'
import { ApiClientError } from '@/lib/api/client'
import { useEvent } from '@/lib/api/queries/events'

import { ParticipateDialog } from './ParticipateDialog'

function EventDetailSkeleton() {
  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-center gap-3">
        <Skeleton className="size-13 rounded-lg" />
        <Skeleton className="h-8 w-2/3" />
      </div>
      <Skeleton className="mt-5 h-12 w-64" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="mt-8 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </article>
  )
}

/**
 * イベント詳細。
 *
 * **見た目は `EventDetailView` が持つ。** ここは取得・参加操作の状態解決・
 * モーダルの開閉だけを担う。作成前プレビュー（`EventPreview`）が同じ
 * `EventDetailView` を描くので、片方だけ直して食い違うことがない。
 */
export default function EventDetailScreen({ eventId }: { eventId: string }) {
  const router = useRouter()
  const { data: event, isPending, error } = useEvent(eventId)
  const [participateMode, setParticipateMode] = React.useState<'create' | 'edit' | null>(
    null
  )
  const [reportOpen, setReportOpen] = React.useState(false)

  if (isPending) return <EventDetailSkeleton />

  if (error) {
    const notFound = error instanceof ApiClientError && error.code === 'NOT_FOUND'
    const forbidden =
      error instanceof ApiClientError &&
      (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED')
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {notFound
            ? 'イベントが見つかりません'
            : forbidden
              ? 'このイベントを表示する権限がありません'
              : 'イベントの取得に失敗しました'}
        </p>
      </div>
    )
  }

  const isEnded = new Date(event.endDate ?? event.startDate) < new Date()
  const stateInput = {
    status: event.status,
    isEnded,
    registrationDeadline: event.registrationDeadline,
    maxParticipants: event.maxParticipants,
    attendingCount: event.counts.attending,
    allowParticipationRequest: event.allowParticipationRequest,
  }
  // resolveEventActionState は「表示上の参加状態」だけを見る純関数なので、
  // 記録の有無ではなく status を渡す
  const viewerState = {
    ...event.viewer,
    participationStatus: event.viewer.participation?.status ?? null,
  }
  const actionState = resolveEventActionState({ ...stateInput, viewer: viewerState })
  /*
    幹事自身の参加状態。isOrganizer を外して同じ規則に通す。
    そうしないと「主催者だから」で締切・満員・登録済みの判定が消え、
    既に参加しているのに参加登録ボタンが出る。
  */
  const selfState = resolveEventActionState({
    ...stateInput,
    viewer: { ...viewerState, isOrganizer: false },
  })

  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-8">
      <EventDetailView
        event={event}
        actionState={actionState}
        selfState={selfState}
        participants={toParticipantViews(event)}
        onParticipate={() => {
          /*
            **未ログインならまずサインインへ。** ボタンには
            「ログインして参加登録」と書いてあるのに、押すと参加モーダルが
            開いて、書き終えてから送れないことに気づく状態だった。
            日程調整（`PreEventDetailScreen`）と同じ扱いにする。
          */
          if (actionState.kind === 'anonymous') {
            router.push(
              `/auth/signin?callbackUrl=${encodeURIComponent(`/events/${event.id}`)}`
            )
            return
          }
          setParticipateMode('create')
        }}
        onEditParticipation={() => setParticipateMode('edit')}
        onReport={() => setReportOpen(true)}
      />

      <ParticipateDialog
        event={event}
        open={participateMode !== null}
        onOpenChange={(v: boolean) => setParticipateMode(v ? participateMode : null)}
        mode={participateMode ?? 'create'}
      />
      <ReportDialog
        target={{ eventId: event.id }}
        title={event.title}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    </article>
  )
}
