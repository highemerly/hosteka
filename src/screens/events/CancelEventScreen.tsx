'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, CircleSlash } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Notice } from '@/components/common/Notice'
import { useConfirm } from '@/components/common/ConfirmDialog'
import { ApiClientError } from '@/lib/api/client'
import { useCancelEvent, useEvent } from '@/lib/api/queries/events'

/**
 * 中止すると変わること。**サーバーが実際に拒む操作と揃える。**
 * 書き分けると、「できます」と書いてあるのに弾かれる案内になる。
 */
const LOST = [
  'イベントを編集できなくなります',
  '参加者を編集できなくなります',
  '新しい参加登録を受け付けなくなります',
  'イベントのページに「中止」と表示されます',
]

/** 中止しても続けられること。連絡や集金の後始末は中止後こそ要る */
const KEPT = ['参加者への連絡', '出欠の記録', '参加者のCSV出力']

/**
 * イベントの中止。
 *
 * **取り消せない操作なので、専用の画面にしてある。** 幹事メニューから
 * 確認ダイアログだけで実行できると、押し間違いが戻せない。
 * 何が変わるかを読んでから押す形にする。
 *
 * **削除は用意しない。** 参加者の記録ごと消えるため。
 * 中止はデータを残したまま受付を閉じる。
 */
export default function CancelEventScreen({ eventId }: { eventId: string }) {
  const router = useRouter()
  const confirm = useConfirm()
  const { data: event, isPending, error } = useEvent(eventId)
  const cancel = useCancelEvent(eventId)

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  /*
    **幹事はここへ来ても中止できない**（サーバーが403を返す）。詳細は幹事にも
    読めるので取得は通る。押してから断るより、先に言う。
  */
  if (error || !event || !event.viewer.canCancel) {
    const forbidden =
      (error instanceof ApiClientError && error.status === 403) ||
      Boolean(event && !event.viewer.canCancel)
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {forbidden
            ? 'このイベントを中止する権限がありません。'
            : 'イベントを読み込めませんでした。'}
        </p>
      </div>
    )
  }

  const backHref = `/events/${eventId}`
  const alreadyCancelled = event.status === 'cancelled'
  /** 影響を受ける人。**数で見せる** — 「参加者に影響します」では重さが伝わらない */
  const affected = event.counts.attending + event.counts.maybe + event.counts.participationRequest

  const onCancel = async () => {
    const ok = await confirm({
      title: `「${event.title}」を中止しますか？`,
      description:
        affected > 0
          ? `${affected}人が登録しています。中止は取り消せません。`
          : '中止は取り消せません。',
      confirmLabel: 'イベントを中止する',
      destructive: true,
    })
    if (!ok) return

    try {
      await cancel.mutateAsync()
      toast.success('イベントを中止しました')
      router.push(backHref)
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.message : 'イベントの中止に失敗しました'
      )
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        イベントに戻る
      </Link>

      <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        イベントを中止
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{event.title}</p>

      {alreadyCancelled ? (
        <div className="mt-6">
          <Notice tone="attention" title="このイベントは既に中止されています">
            参加者への連絡や出欠の記録は続けられます。
          </Notice>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <Notice tone="danger" title="中止は取り消せません">
            通常の状態には戻せません。日時や場所を変えたいだけなら、中止ではなく
            <Link href={`/events/${eventId}/edit`} className="mx-1 text-primary hover:underline">
              イベントを編集
            </Link>
            してください。
          </Notice>

          <section>
            <h2 className="text-base font-bold text-foreground">中止すると</h2>
            <ul className="mt-2 space-y-1">
              {LOST.map((line) => (
                <li key={line} className="text-sm text-foreground">
                  ・{line}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="text-base font-bold text-foreground">中止しても続けられること</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              参加者の記録は残ります。中止したことを知らせたり、集金の後始末をしたりできます。
            </p>
            <ul className="mt-2 space-y-1">
              {KEPT.map((line) => (
                <li key={line} className="text-sm text-foreground">
                  ・{line}
                </li>
              ))}
            </ul>
          </section>

          {affected > 0 ? (
            <p className="text-sm text-muted-foreground">
              いま{affected}人が登録しています。中止したら
              <Link
                href={`/events/${eventId}/contact`}
                className="mx-1 text-primary hover:underline"
              >
                参加者への連絡
              </Link>
              から知らせてください。
            </p>
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:justify-end">
            <Button variant="default" asChild>
              <Link href={backHref}>やめる</Link>
            </Button>
            <Button
              variant="destructive"
              className="sm:min-w-56"
              disabled={cancel.isPending}
              onClick={onCancel}
            >
              <CircleSlash className="size-5" />
              {cancel.isPending ? '中止しています…' : 'イベントを中止する'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
