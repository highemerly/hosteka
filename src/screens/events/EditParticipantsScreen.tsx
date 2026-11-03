'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronLeft, Crown } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Notice } from '@/components/common/Notice'
import { useConfirm, type ConfirmOptions } from '@/components/common/ConfirmDialog'
import { UserAvatar } from '@/components/event/EventInfoRow'
import { OptionChips } from '@/components/event/ParticipantList'
import { ApiClientError } from '@/lib/api/client'
import { profileUrl } from '@/lib/profile-url'
import { useManageParticipants, useParticipantAction } from '@/lib/api/queries/events'
import {
  allowedAdminActions,
  STATUS_LABEL_JA,
  type ParticipantAdminAction,
  type ParticipantStatus,
} from '@/lib/status-transition'
import type { EventOptionGroupDto, ManageParticipantDto } from '@/server/serializers/event'

import { selectedOptionViews } from './participant-options'

/**
 * 状態ごとの並び。**「参加リクエスト」を上に出す。**
 * 主催者の返事を待っている人なので、開いてすぐ目に入る位置に置く。
 *
 * 参加・未定の節には「キャンセルは戻せない」を出す。キャンセルにする
 * ボタンがあるのはこの2つの節だけなので、押す前に目に入る場所に置く。
 */
const NO_RETURN = '一度キャンセルにしたユーザーを参加に戻すことはできません'

const SECTIONS: { status: ParticipantStatus; notice?: string }[] = [
  { status: 'participation_request' },
  { status: 'attending', notice: NO_RETURN },
  { status: 'maybe', notice: NO_RETURN },
  { status: 'not_attending' },
  { status: 'cancelled' },
]

/**
 * 操作ごとのボタンと確認。**どれも押すとその場で反映される**ので、
 * 取り返しのつかないものに限らず、すべて確認を挟む。
 */
const ACTIONS: Record<
  ParticipantAdminAction,
  {
    label: string
    variant: 'primary' | 'default' | 'destructive'
    done: string
    confirm: (p: ManageParticipantDto) => ConfirmOptions
  }
> = {
  approve: {
    label: '承認',
    variant: 'primary',
    done: '承認しました',
    confirm: (p) => ({
      title: `${p.user.displayName}さんの参加リクエストを承認しますか？`,
      confirmLabel: '承認する',
      primary: true,
    }),
  },
  reject: {
    label: '拒否',
    variant: 'destructive',
    done: '拒否しました',
    confirm: (p) => ({
      title: `${p.user.displayName}さんの参加リクエストを拒否しますか？`,
      description: 'キャンセルになり、参加には戻せません。',
      confirmLabel: '拒否する',
      destructive: true,
    }),
  },
  cancel: {
    label: 'キャンセルにする',
    variant: 'destructive',
    done: 'キャンセルにしました',
    confirm: (p) => ({
      title: `${p.user.displayName}さんをキャンセルにしますか？`,
      description: p.isOrganizer
        ? '参加には戻せません。幹事からも外れます。'
        : '参加には戻せません。',
      confirmLabel: 'キャンセルにする',
      destructive: true,
    }),
  },
  assign_organizer: {
    label: '幹事にする',
    variant: 'default',
    done: '幹事にしました',
    confirm: (p) => ({
      title: `${p.user.displayName}さんを幹事にしますか？`,
      description: '参加者の編集・出欠登録・連絡ができるようになります。',
      confirmLabel: '幹事にする',
    }),
  },
  unassign_organizer: {
    label: '幹事を解除',
    variant: 'default',
    done: '幹事を解除しました',
    confirm: (p) => ({
      title: `${p.user.displayName}さんを幹事から外しますか？`,
      confirmLabel: '幹事を解除する',
    }),
  },
  delete: {
    label: '削除',
    variant: 'destructive',
    done: '削除しました',
    confirm: (p) => ({
      title: `${p.user.displayName}さんの回答を削除しますか？`,
      /* 消えた人は一から登録し直せる。知らないと「締め出した」つもりで消してしまう */
      description: '回答の記録が消え、本人はもう一度参加登録できるようになります。',
      confirmLabel: '削除する',
      destructive: true,
    }),
  },
}

function ParticipantRow({
  participant,
  optionGroups,
  viewerIsCreator,
  busy,
  onAction,
}: {
  participant: ManageParticipantDto
  optionGroups: EventOptionGroupDto[]
  viewerIsCreator: boolean
  /** この人への操作を送っている最中 */
  busy: boolean
  onAction: (action: ParticipantAdminAction) => void
}) {
  const href = profileUrl(participant.user)
  const handle = `@${participant.user.username}@${participant.user.server}`
  const options = selectedOptionViews(participant, optionGroups)
  const actions = allowedAdminActions(
    {
      status: participant.status as ParticipantStatus,
      isOrganizer: participant.isOrganizer,
      isCreator: participant.isCreator,
    },
    { isCreator: viewerIsCreator }
  )

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      {/*
        **狭い画面ではボタンを名前の下の行へ回す。** 横に並べると
        「キャンセルにする」の幅だけ名前の欄が削られ、ほとんど読めなくなる。
      */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <UserAvatar name={participant.user.displayName} src={participant.user.avatar} size="sm" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium text-foreground">
                {participant.user.displayName}
              </span>
              {participant.isCreator ? (
                <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                  <Crown className="size-3" aria-hidden />
                  主催者
                </span>
              ) : participant.isOrganizer ? (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                  幹事
                </span>
              ) : null}
              {href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  {handle}
                </a>
              ) : (
                <span className="truncate text-xs text-muted-foreground">{handle}</span>
              )}
            </div>

            {options.length > 0 ? (
              <OptionChips name={participant.user.displayName} options={options} />
            ) : null}

            {participant.comment ? (
              <p className="mt-1 rounded-lg bg-[var(--surface-subtle)] px-3 py-2 text-sm break-words whitespace-pre-wrap text-foreground">
                {participant.comment}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:shrink-0">
          {actions.map((action) => (
            <Button
              key={action}
              size="sm"
              variant={ACTIONS[action].variant}
              disabled={busy}
              onClick={() => onAction(action)}
            >
              {ACTIONS[action].label}
            </Button>
          ))}
        </div>
      </div>
    </li>
  )
}

/**
 * 参加者を編集する。
 *
 * **1つの操作をその場で反映する。** 押すたびに確認を挟み、保存ボタンは
 * 持たない。できる操作は `allowedAdminActions` から作る。**画面用の表を
 * 別に書かない** — サーバーも同じ関数で判定するので、押せるのに送ると
 * 失敗するボタンができない。
 */
export default function EditParticipantsScreen({ eventId }: { eventId: string }) {
  const confirm = useConfirm()
  const { data, isPending, error } = useManageParticipants(eventId)
  const mutation = useParticipantAction(eventId)

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
        {Array.from({ length: 5 }, (_, i) => (
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
            ? 'このイベントの参加者を編集する権限がありません。'
            : '参加者を読み込めませんでした。'}
        </p>
      </div>
    )
  }

  const run = async (participant: ManageParticipantDto, action: ParticipantAdminAction) => {
    const spec = ACTIONS[action]
    if (!(await confirm(spec.confirm(participant)))) return

    try {
      await mutation.mutateAsync({ userId: participant.user.id, action })
      toast.success(spec.done)
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : '操作に失敗しました')
    }
  }

  const busyUserId = mutation.isPending ? mutation.variables?.userId : undefined

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <Link
        href={`/events/${eventId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        イベントに戻る
      </Link>

      <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        参加者を編集
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{data.event.title}</p>

      <div className="mt-6 space-y-8">
        {SECTIONS.map((section) => {
          const people = data.participants.filter((p) => p.status === section.status)
          if (people.length === 0) return null

          return (
            <section key={section.status}>
              <h2 className="text-base font-bold text-foreground">
                {STATUS_LABEL_JA[section.status]}（{people.length}人）
              </h2>
              {section.notice ? <Notice className="mt-3" title={section.notice} /> : null}

              <ul className="mt-3 space-y-2">
                {people.map((participant) => (
                  <ParticipantRow
                    key={participant.id}
                    participant={participant}
                    optionGroups={data.optionGroups}
                    viewerIsCreator={data.viewer.isCreator}
                    busy={busyUserId === participant.user.id}
                    onAction={(action) => run(participant, action)}
                  />
                ))}
              </ul>
            </section>
          )
        })}

        {data.participants.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            まだ参加者がいません。
          </p>
        ) : null}
      </div>
    </div>
  )
}
