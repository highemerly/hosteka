'use client'

import * as React from 'react'
import { ChevronLeft, Eye } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { EventDetailView, toParticipantViews } from '@/components/event/EventDetailView'
import { resolveEventActionState } from '@/components/event/resolveActionState'
import type { EventDetailDto } from '@/server/serializers/event'

import { ParticipateDialog } from './ParticipateDialog'

/**
 * 作成前プレビュー。
 *
 * **フォームを隠して、詳細ページと同じものを同じ幅で描く。** モーダルに
 * 収めると幅が変わり、行の折り返しが本番と一致しない。確かめたいのは
 * まさにそこなので、原寸で見せる。
 *
 * 参加者の目線で描く（`buildPreviewEvent` が `viewer` をそう組む）。
 * 主催者が知りたいのは「参加者にどう見えるか」であって、
 * 自分に幹事メニューが出ることではない。
 *
 * **保存はしない。** ここから作成することはできるが、その処理は
 * フォーム側（`EventFormScreen`）が持つ。プレビューは描くだけ。
 */
export function EventPreview({
  event,
  submitLabel,
  submitting,
  onBack,
  onSubmit,
}: {
  event: EventDetailDto
  /** 「イベントを作成」/「変更を保存」。作成と編集で変わる */
  submitLabel: string
  submitting: boolean
  onBack: () => void
  onSubmit: () => void
}) {
  const [participateOpen, setParticipateOpen] = React.useState(false)

  /*
    参加操作の状態は本番と同じ関数で導く。
    **ここが効く場面がある** — 締切を過去にしていれば
    「回答締切を過ぎました」が、開催日が過去なら「終了しました」が出る。
    作る前に気づけるのはプレビューの主目的のひとつ。
  */
  const isEnded = new Date(event.endDate ?? event.startDate) < new Date()
  const actionState = resolveEventActionState({
    status: event.status,
    isEnded,
    registrationDeadline: event.registrationDeadline,
    maxParticipants: event.maxParticipants,
    attendingCount: event.counts.attending,
    allowParticipationRequest: event.allowParticipationRequest,
    viewer: {
      ...event.viewer,
      participationStatus: null,
    },
  })

  return (
    <>
      {/*
        プレビューから抜ける道は常に見えていなければならない。
        ヘッダー（h-14）の下に貼り付ける。
        ここは「浮いている層」なのでガラス（docs/DESIGN_GUIDELINES.md §1）。
      */}
      <div className="glass sticky top-14 z-30 border-x-0 border-t-0 border-b-border">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Eye className="size-4 text-muted-foreground" />
            プレビュー
            <span className="font-normal text-muted-foreground">
              まだ保存されていません
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={onBack} disabled={submitting}>
              <ChevronLeft className="size-4" data-icon="inline-start" />
              編集に戻る
            </Button>
            <Button variant="primary" size="sm" onClick={onSubmit} disabled={submitting}>
              {submitting ? '保存中…' : submitLabel}
            </Button>
          </div>
        </div>
      </div>

      <article className="mx-auto w-full max-w-5xl px-4 py-8">
        <EventDetailView
          event={event}
          variant="preview"
          actionState={actionState}
          participants={toParticipantViews(event, { preview: true })}
          onParticipate={() => setParticipateOpen(true)}
        />
      </article>

      {/*
        参加登録モーダルもプレビューできる。オプションの並びと参加規約は
        詳細ページ本体には出ないので、ここを開けないと確かめる術がない。
      */}
      <ParticipateDialog
        event={event}
        open={participateOpen}
        onOpenChange={setParticipateOpen}
        mode="create"
        preview
      />
    </>
  )
}
