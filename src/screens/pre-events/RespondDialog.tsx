'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Textarea } from '@/components/ui/textarea'
import { ToggleField } from '@/components/ui/toggle-switch'
import SafeMarkdown from '@/components/SafeMarkdown'
import { DateBadge } from '@/components/event/DateBadge'
import { formatOptionRange } from '@/components/pre-event/date-option-label'
import { VOTE_LABEL, VOTE_MARK, VOTES } from '@/components/pre-event/vote'
import { ApiClientError } from '@/lib/api/client'
import { useRespondPreEvent } from '@/lib/api/queries/pre-events'
import { VALIDATION_LIMITS } from '@/schemas/limits'
import type { PreEventDetailDto, PreEventVote } from '@/server/serializers/pre-event'

/**
 * 日程の回答。
 *
 * **候補日ごとに3択を出す。** イベントの参加登録は1つの答えを選ぶが、
 * こちらは日ごとに独立している。既定は「参加できる」にしない —
 * 押さずに送れてしまうと、答えていない日が○として集計される。
 *
 * 参加登録モーダル（ParticipateDialog）と同じ骨格・同じ部品で組む。
 */
export function RespondDialog({
  preEvent,
  open,
  onOpenChange,
}: {
  preEvent: PreEventDetailDto
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const respond = useRespondPreEvent(preEvent.id)
  const mine = preEvent.viewer.response
  const editing = mine !== null

  const [votes, setVotes] = React.useState<Record<string, PreEventVote>>({})
  const [comment, setComment] = React.useState('')
  const [autoRegister, setAutoRegister] = React.useState(false)

  /*
    開くたびに現在の回答へ戻す。閉じて開き直したときに前回の入力が
    残っていると、意図しない内容で送信される。
    **描画中に戻す** — effect だと前回の回答を一度描いてから差し替わる
    （`react-hooks/set-state-in-effect`）。
  */
  const [lastOpened, setLastOpened] = React.useState<typeof mine | false>(open ? mine : false)
  if (open ? lastOpened !== mine : lastOpened !== false) {
    setLastOpened(open ? mine : false)
    if (open) {
      setVotes(mine?.votes ?? {})
      setComment(mine?.comment ?? '')
      setAutoRegister(mine?.autoRegisterWhenPromoted ?? false)
    }
  }

  const unanswered = preEvent.dateOptions.filter((o) => !votes[o.id])
  const tooLong = comment.length > VALIDATION_LIMITS.PARTICIPANT_COMMENT
  const canSubmit = unanswered.length === 0 && !tooLong

  const blockedReason = unanswered.length
    ? `${unanswered.length}日分の回答が残っています`
    : tooLong
      ? `コメントは${VALIDATION_LIMITS.PARTICIPANT_COMMENT}文字以内で入力してください`
      : null

  const submit = () => {
    respond.mutate(
      {
        // 全部の候補日を送る。送らなかった日の扱いをサーバーに委ねると、
        // 画面で見えている状態と食い違う
        responses: preEvent.dateOptions.map((o) => ({
          dateOptionId: o.id,
          status: votes[o.id],
        })),
        comment: comment.trim() || undefined,
        autoRegisterWhenPromoted: preEvent.allowAutoRegistration ? autoRegister : undefined,
      },
      {
        onSuccess: () => {
          toast.success(editing ? '回答を変更しました' : '日程を回答しました')
          onOpenChange(false)
        },
        onError: (e) => {
          toast.error(
            e instanceof ApiClientError
              ? (e.details?.[0]?.message ?? e.message)
              : '回答に失敗しました'
          )
        },
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? '回答の変更' : '日程の回答'}</DialogTitle>
          <DialogDescription>{preEvent.title}</DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
          <div className="space-y-3">
            {preEvent.dateOptions.map((option) => {
              const range = formatOptionRange(option.startDate, option.endDate, 'short')
              return (
              <div key={option.id} className="flex items-center gap-2 sm:gap-3">
                <DateBadge date={option.startDate} size="sm" />
                {/*
                  狭い画面では時刻を日付の下へ回さず、幅だけ詰める。
                  複数日にわたる候補は終了日まで出す（短い書き方）— **出さないと
                  同じ日の 10:00–15:00 に見えたまま答えることになる。**
                  時刻を決めていない候補では空になる
                */}
                {range ? (
                  <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                    {range}
                  </span>
                ) : null}
                <SegmentedControl
                  aria-label={`${option.startDate} の回答`}
                  value={votes[option.id] ?? ''}
                  onValueChange={(v) =>
                    setVotes((prev) => ({ ...prev, [option.id]: v as PreEventVote }))
                  }
                  options={VOTES.map((vote) => ({
                    value: vote,
                    label: (
                      <span className="inline-flex items-center justify-center gap-1.5">
                        <span aria-hidden className="text-base leading-none">
                          {VOTE_MARK[vote]}
                        </span>
                        {/*
                          **狭い画面では記号だけにする。** 3つ並ぶので、
                          ラベルまで出すと横がはみ出す。○△×は日程調整で
                          最も通じる記号なので、記号だけでも意味は伝わる。
                          読み上げには常に語を渡す（sr-only）。
                        */}
                        <span className="hidden sm:inline">{VOTE_LABEL[vote]}</span>
                        <span className="sr-only sm:hidden">{VOTE_LABEL[vote]}</span>
                      </span>
                    ),
                    // 塗りは「選択中」の印。どの回答でも同じ色にする
                    tone: 'primary' as const,
                  }))}
                  className="h-12 min-w-0 flex-1"
                />
              </div>
              )
            })}
          </div>

          {/*
            **公開されることは欄の名前で言う**（イベントの参加登録と同じ）。
            コメントは回答の一覧に出る（`RespondentList`）。幹事への私信の
            つもりで書けてしまうが、画面を見ても宛先は分からない。

            手本（placeholder）は残す。第一希望は候補日の○△×だけでは
            伝わらず、書かれないと幹事が決められない。
          */}
          <div>
            <label htmlFor="respond-comment" className="mb-2 block text-sm font-medium">
              コメント（任意・回答一覧に公開）
            </label>
            <Textarea
              id="respond-comment"
              rows={3}
              placeholder="第一希望や、調整が必要な事情など"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <p className="mt-1 text-right text-sm text-muted-foreground">
              {comment.length} / {VALIDATION_LIMITS.PARTICIPANT_COMMENT}
            </p>
          </div>

          {preEvent.allowAutoRegistration ? (
            <ToggleField
              label="日程が決まったら自動で参加登録する"
              description="○を付けた日に決まった場合だけ登録されます"
              checked={autoRegister}
              onCheckedChange={setAutoRegister}
            />
          ) : null}

          {preEvent.terms ? (
            <div className="space-y-2">
              <span className="block text-sm font-medium">参加規約</span>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-[var(--surface-subtle)] px-3 py-2">
                <SafeMarkdown>{preEvent.terms}</SafeMarkdown>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {blockedReason ? (
            <span className="text-xs text-muted-foreground sm:mr-auto sm:self-center">
              {blockedReason}
            </span>
          ) : null}
          <Button
            variant="default"
            className="w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            閉じる
          </Button>
          <Button
            variant="primary"
            className="w-full sm:w-auto sm:min-w-40"
            disabled={!canSubmit || respond.isPending}
            onClick={submit}
          >
            {respond.isPending ? '送信中…' : editing ? '回答を変更する' : '回答する'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
