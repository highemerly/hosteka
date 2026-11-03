'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { Notice } from '@/components/common/Notice'
import { Field, fieldAria } from '@/components/form/Field'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api/client'
import { useBanUser } from '@/lib/api/queries/admin'
import { BAN_REASON_MAX, banUserBody } from '@/schemas/admin'

export type BanTarget = {
  id: string
  displayName: string
  username: string
  server: string
  /** 主催している件数。**BAN するとこれが無効化される**（消えはしない） */
  hosted: { events: number; preEvents: number }
}

/**
 * BAN の入力と確認を1枚にしたもの。
 *
 * **BAN は停止であって削除ではない。** アカウントは残り、主催していた
 * イベントと日程調整は無効化される（表から消えるが、参加者の記録も、
 * BAN の根拠になった通報も残る）。以前は当人を削除しており、
 * **BAN の根拠まで一緒に消えていた**。
 *
 * 旧画面は `prompt()` で理由を聞き、別の確認ダイアログでユーザー名を
 * 打たせる2段構えだった（通報の詳細からは確認なしで BAN できた）。
 * 理由・起きること・名前の入力を1枚に並べ、どこから開いても同じにする。
 */
export function BanUserDialog({
  target,
  open,
  onOpenChange,
  onBanned,
}: {
  target: BanTarget | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** BAN が済んだあと。一覧の行はキャッシュの取り直しで消える */
  onBanned?: () => void
}) {
  const [reason, setReason] = React.useState('')
  const [phrase, setPhrase] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const ban = useBanUser()

  /*
    開き直したときに前の人の入力を残さない。**描画中に戻す** —
    effect で消すと、前の人の理由を一度描いてから空になる
    （`react-hooks/set-state-in-effect`）。開いたかどうかと相手の両方を見る。
  */
  const openedFor = open ? (target?.id ?? '') : null
  const [lastOpenedFor, setLastOpenedFor] = React.useState(openedFor)
  if (openedFor !== lastOpenedFor) {
    setLastOpenedFor(openedFor)
    if (openedFor !== null) {
      setReason('')
      setPhrase('')
      setError(null)
    }
  }

  if (!target) return null

  const phraseOk = phrase.trim() === target.username
  const { events, preEvents } = target.hosted

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!phraseOk) return

    // 検証はサーバーと同じ定義で行う。文言もここで作らない
    const parsed = banUserBody.safeParse({ reason })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'BAN理由を確かめてください')
      return
    }
    setError(null)

    ban.mutate(
      { id: target.id, reason: parsed.data.reason },
      {
        onSuccess: () => {
          toast.success(`${target.displayName} をBANしました`)
          onOpenChange(false)
          onBanned?.()
        },
        onError: (err) =>
          toast.error(err instanceof ApiClientError ? err.message : 'BANできませんでした'),
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (ban.isPending ? undefined : onOpenChange(next))}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>このユーザーをBANしますか？</DialogTitle>
            {/* 誰を BAN しようとしているのか。行を取り違えない */}
            <DialogDescription>
              {target.displayName}（@{target.username}@{target.server}）
            </DialogDescription>
          </DialogHeader>

          <Notice tone="danger" title="ログインできなくなり、主催しているものが無効化されます" className="mt-5">
            <ul className="space-y-0.5">
              {events + preEvents > 0 ? (
                <li>
                  主催している
                  {[events ? `イベント${events}件` : null, preEvents ? `日程調整${preEvents}件` : null]
                    .filter(Boolean)
                    .join('・')}
                  が無効化され、参加者から見えなくなります
                </li>
              ) : null}
              <li>BANを解除しても、無効化されたものは戻りません（1件ずつ有効化します）</li>
            </ul>
          </Notice>

          <div className="mt-5 space-y-5">
            <Field
              label="BAN理由"
              htmlFor="ban-reason"
              required
              error={error ?? undefined}
              hint={`${reason.length}/${BAN_REASON_MAX}`}
            >
              <Textarea
                {...fieldAria('ban-reason', error ?? undefined)}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={BAN_REASON_MAX}
                rows={3}
              />
            </Field>

            {/* 重い操作なので、名前を打たせて行の取り違えを止める */}
            <Field
              label={
                <>
                  確認のため <code className="font-mono font-semibold">{target.username}</code> と入力
                </>
              }
              htmlFor="ban-phrase"
            >
              <Input
                id="ban-phrase"
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </Field>
          </div>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="default"
              disabled={ban.isPending}
              onClick={() => onOpenChange(false)}
            >
              やめる
            </Button>
            <Button type="submit" variant="destructive" disabled={!phraseOk || ban.isPending}>
              {ban.isPending ? 'BANしています…' : 'BANする'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
