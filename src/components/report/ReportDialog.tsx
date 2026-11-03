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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ApiClientError } from '@/lib/api/client'
import { useCreateReport } from '@/lib/api/queries/reports'
import { createReportBody, isReportableTarget, type ReportTarget } from '@/schemas/report'

/** 通報理由の上限。schema.prisma の Report.reason VarChar(500) に対応する */
const REASON_MAX = 500

/**
 * 通報の入力。イベントと日程調整の両方から使う。
 *
 * **対象を1つだけ受け取る。** どちらを通報しているのかは呼び出し側が
 * 知っているので、ここで判断しない（サーバーも「どちらか一方」を要求する）。
 *
 * 通報は取り消せない上に、相手には見えない形で管理者へ届く。
 * だから確認ダイアログではなく**入力**を挟む — 何が問題なのかを
 * 書けないまま押せてしまうと、受け取った側が判断できない。
 */
export function ReportDialog({
  target,
  title,
  open,
  onOpenChange,
}: {
  /** 通報の対象。イベントか日程調整のどちらか一方 */
  target: ReportTarget
  /** 対象の名前。何を通報しようとしているのかを画面で確かめられるようにする */
  title: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [reason, setReason] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const createReport = useCreateReport()

  /*
    開き直したときに前回の下書きとエラーを残さない。
    **描画中に戻す** — effect で消すと、前回の内容を一度描いてから空になる
    （`react-hooks/set-state-in-effect`）。
  */
  const [lastOpen, setLastOpen] = React.useState(open)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setReason('')
      setError(null)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()

    // 検証はサーバーと同じ定義で行う。文言もここで作らない
    const parsed = createReportBody.safeParse({ reason, ...target })
    if (!parsed.success) {
      /*
        **理由についての指摘だけを入力欄に出す。** 対象IDが契約に合わない
        場合もここへ来るが、それは閲覧者が理由を書き直しても直らない。
        入力欄に出すと、直しようのない文言を前に手が止まる。
        （その対象では通報ボタン自体を出さないので、通常ここは通らない）
      */
      const onReason = parsed.error.issues.find((i) => i.path[0] === 'reason')
      if (onReason) {
        setError(onReason.message)
        return
      }
      toast.error('このイベントは通報できません。お手数ですが管理者へご連絡ください')
      return
    }
    setError(null)

    createReport.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('通報を送信しました。確認のうえ対応します')
        onOpenChange(false)
      },
      onError: (err) => {
        toast.error(
          err instanceof ApiClientError ? err.message : '通報の送信に失敗しました'
        )
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>通報する</DialogTitle>
            {/* 対象名を出す。一覧から開いたときに取り違えない */}
            <DialogDescription>{title}</DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-2">
            <Label htmlFor="report-reason">通報理由</Label>
            <Textarea
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={REASON_MAX}
              rows={4}
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'report-reason-error' : undefined}
              placeholder="どこが問題なのかを具体的に書いてください（例：スパム、詐欺、参加者への攻撃的な表現）"
            />
            <div className="flex items-start justify-between gap-3">
              {error ? (
                <p id="report-reason-error" className="text-sm text-destructive">
                  {error}
                </p>
              ) : (
                <span />
              )}
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {reason.length}/{REASON_MAX}
              </span>
            </div>
          </div>

          {/* 押す前に知らせる。送ったあとで伝えても取り消せない */}
          <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
            <li>・内容は管理者だけが確認します。主催者には伝わりません</li>
            <li>・虚偽の通報は利用規約違反になることがあります</li>
          </ul>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="default"
              disabled={createReport.isPending}
              onClick={() => onOpenChange(false)}
            >
              やめる
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={createReport.isPending || !isReportableTarget(target)}
            >
              {createReport.isPending ? '送信中…' : '通報する'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
