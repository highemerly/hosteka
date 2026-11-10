'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { Skeleton } from '@/components/ui/skeleton'
import { PreEventDetailView } from '@/components/pre-event/PreEventDetailView'
import { resolvePreEventActionState } from '@/components/pre-event/resolvePreEventActionState'
import { ReportDialog } from '@/components/report/ReportDialog'
import { useConfirm } from '@/components/common/ConfirmDialog'
import { useViewer } from '@/hooks/useViewer'
import { ApiClientError } from '@/lib/api/client'
import { useDeletePreEvent, usePreEvent } from '@/lib/api/queries/pre-events'

import { RespondDialog } from './RespondDialog'

function PreEventDetailSkeleton() {
  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-lg" />
        <Skeleton className="h-8 w-2/3" />
      </div>
      <Skeleton className="mt-5 h-12 w-64" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-6 w-24" />
      </div>
      <div className="mt-8 space-y-2">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </article>
  )
}

/**
 * 日程調整の詳細。
 *
 * **見た目は `PreEventDetailView` が持つ。** ここは取得・回答操作の
 * 状態解決・モーダルの開閉だけを担う。イベント詳細（`EventDetailScreen`）と
 * 同じ作りにしてある。
 */
export default function PreEventDetailScreen({ preEventId }: { preEventId: string }) {
  const router = useRouter()
  const { viewer } = useViewer()
  const confirm = useConfirm()
  const { data: preEvent, isPending, error } = usePreEvent(preEventId)
  const remove = useDeletePreEvent(preEventId)
  const [respondOpen, setRespondOpen] = React.useState(false)
  const [reportOpen, setReportOpen] = React.useState(false)

  if (isPending) return <PreEventDetailSkeleton />

  if (error) {
    const notFound = error instanceof ApiClientError && error.code === 'NOT_FOUND'
    const forbidden =
      error instanceof ApiClientError &&
      (error.code === 'FORBIDDEN' || error.code === 'UNAUTHENTICATED')
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {notFound
            ? '日程調整が見つかりません'
            : forbidden
              ? 'この日程調整を表示する権限がありません'
              : '日程調整の取得に失敗しました'}
        </p>
      </div>
    )
  }

  const stateInput = {
    dateOptions: preEvent.dateOptions,
    registrationDeadline: preEvent.registrationDeadline,
    promotion: preEvent.promotion,
    viewer: preEvent.viewer,
  }
  const state = resolvePreEventActionState(stateInput)
  /*
    主催者自身の回答状態。isOrganizer を外して同じ規則に通す。
    そうしないと「主催者だから」で締切・終了・回答済みの判定が消え、
    既に答えているのに「日程を回答する」が出る（イベント側と同じ作り）。
  */
  const selfState = resolvePreEventActionState({
    ...stateInput,
    viewer: { ...preEvent.viewer, isOrganizer: false },
  })

  /*
    **グループのスタッフには渡さない**（`viewer.canDelete`）。渡さなければ
    幹事メニューに削除の項目が出ない。編集はできても削除はできない。
  */
  const onDelete = async () => {
    /*
      **回答も一緒に消える**（DB の cascade）。何が失われるかを
      数で見せてから確かめる。取り消せない。
    */
    const ok = await confirm({
      title: `「${preEvent.title}」を削除しますか？`,
      description:
        preEvent.respondentCount > 0
          ? `${preEvent.respondentCount}人分の回答も一緒に消えます。元に戻せません。`
          : '元に戻せません。',
      confirmLabel: '削除する',
      destructive: true,
    })
    if (!ok) return

    try {
      await remove.mutateAsync()
      toast.success('日程調整を削除しました')
      router.push('/pre-events')
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.message : '日程調整の削除に失敗しました'
      )
    }
  }

  return (
    <article className="mx-auto w-full max-w-5xl px-4 py-8">
      <PreEventDetailView
        preEvent={preEvent}
        state={state}
        selfState={selfState}
        onRespond={() => {
          // 未ログインならまずサインインへ。モーダルを開いても送れない
          if (!viewer) {
            router.push(`/auth/signin?callbackUrl=/pre-events/${preEvent.id}`)
            return
          }
          setRespondOpen(true)
        }}
        onReport={() => setReportOpen(true)}
        onDelete={preEvent.viewer.canDelete ? onDelete : undefined}
      />

      <RespondDialog
        preEvent={preEvent}
        open={respondOpen}
        onOpenChange={setRespondOpen}
      />
      <ReportDialog
        target={{ preEventId: preEvent.id }}
        title={preEvent.title}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    </article>
  )
}
