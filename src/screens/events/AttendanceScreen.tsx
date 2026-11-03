'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, ChevronLeft, ClipboardList, Coins, Search, StickyNote, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { UserAvatar } from '@/components/event/EventInfoRow'
import { ApiClientError } from '@/lib/api/client'
import {
  useAttendance,
  useSaveAttendance,
  type SaveAttendanceInput,
} from '@/lib/api/queries/events'
import { STATUS_LABEL_JA, type ParticipantStatus } from '@/lib/status-transition'
import { cn } from '@/lib/utils'
import type { AttendanceRowDto } from '@/server/serializers/event'

import {
  byUnenteredFirst,
  filterRows,
  isFiltering,
  NO_FILTER,
  summarize,
  type AttendanceFilter,
} from './attendance-summary'

/** 当日の出欠。**未記録は欠席ではない**ので、3つ目として並べる */
const ATTEND_OPTIONS = [
  { value: 'not_entered' as const, label: '未' },
  { value: 'present' as const, label: '出席', tone: 'primary' as const },
  { value: 'absent' as const, label: '欠席' },
]

const FEE_OPTIONS = [
  { value: 'not_entered' as const, label: '未' },
  { value: 'paid' as const, label: '受領', tone: 'primary' as const },
  { value: 'unpaid' as const, label: '未払' },
]

/*
  絞り込みの選択肢。**行の操作と同じ語彙・同じ順で並べる。**
  頭に「すべて」を足すだけにして、「未」と「未払」の位置が
  絞り込みと操作で入れ替わらないようにする。
*/
const ATTEND_FILTERS = [{ value: 'all' as const, label: 'すべて' }, ...ATTEND_OPTIONS]
const FEE_FILTERS = [{ value: 'all' as const, label: 'すべて' }, ...FEE_OPTIONS]

function Row({
  row,
  saving,
  onSave,
}: {
  row: AttendanceRowDto
  saving: boolean
  onSave: (input: {
    attendStatus?: AttendanceRowDto['attendStatus']
    feeStatus?: AttendanceRowDto['feeStatus']
    memo?: string | null
  }) => void
}) {
  /*
    他の端末で更新されたら追いつく。打っている最中は触らない。
    **描画中に合わせる** — effect で `setMemo` すると古い内容を一度描いてから
    差し替わる（`react-hooks/set-state-in-effect`）。
  */
  const [memo, setMemo] = React.useState(row.memo ?? '')
  const [lastMemo, setLastMemo] = React.useState(row.memo ?? '')
  if ((row.memo ?? '') !== lastMemo) {
    setLastMemo(row.memo ?? '')
    setMemo(row.memo ?? '')
  }

  const done = row.attendStatus !== 'not_entered'

  return (
    <li
      className={cn(
        'rounded-xl border p-3 transition-colors',
        done ? 'border-border bg-[var(--surface-subtle)]' : 'border-border bg-card'
      )}
    >
      {/*
        **誰かを確かめる部分と、押す部分を分ける。**
        上は顔の右に字下げして読ませる塊、下は操作。操作はカードの幅を
        いっぱいに使う — 受付で押す的なので、狭くする理由がない。
      */}
      <div className="flex gap-3">
        <UserAvatar name={row.user.displayName} src={row.user.avatar} size="sm" />

        <div className="min-w-0 flex-1 space-y-1">
          <div>
            {/*
              保存中の合図は名前の行に出す。**行を1本増やさない** —
              押すたびに現れて消える行があると、下の内容が上下する。
              誰がいつ記録したかは画面に残さない（CSVで追える）。
            */}
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-medium text-foreground">
                {row.user.displayName}
              </span>
              {saving ? (
                <span className="shrink-0 text-xs text-muted-foreground">保存中…</span>
              ) : null}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              @{row.user.username}@{row.user.server}
            </span>
          </div>

          {/*
            事前の回答と、選んだオプション。**押す前に目に入る位置**に置く
            （食事の受け渡し、2次会の集金はこれを見て決める）。

            **同じ「見出し: 中身」の形で、同じ左端から並べる。** 塗りや
            余白を付けると、その分だけ中身が右へずれて名前やIDと揃わない。
            グループ名まで出す — 「肉」だけでは何の選択か分からない。
          */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>
              事前:{' '}
              <span className="text-foreground">
                {STATUS_LABEL_JA[row.participantStatus as ParticipantStatus] ??
                  row.participantStatus}
              </span>
            </span>
            {row.options.map((group) => (
              <span key={group.title}>
                {group.title}:{' '}
                <span className="text-foreground">{group.names.join('・')}</span>
              </span>
            ))}
          </div>

          {row.comment ? (
            <p className="text-xs text-muted-foreground">参加時のコメント: {row.comment}</p>
          ) : null}
        </div>
      </div>

      {/*
        **出欠と集金は並べて置く。** 受付では1人につきこの2つを続けて
        押すので、離すと視線と指が行き来する。幅は中身に合わせる —
        決め打ちにすると、内側の余白と噛み合ったときに文字が切れる。
      */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <span className="flex flex-1 items-center gap-2">
          {/*
            ラベルの幅を揃えて、2つのセグメントの左端を合わせる。
            **記号は幹事メニューの「出欠登録」と同じものを使う** —
            画面をまたいで「この記号＝出欠」が通じる。PCでは記号だけ残し、
            集金（コイン）と見分けられるようにする。
          */}
          <span className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
            <ClipboardList className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">出欠</span>
          </span>
          <SegmentedControl
            aria-label={`${row.user.displayName}の出欠`}
            value={row.attendStatus}
            onValueChange={(attendStatus) => onSave({ attendStatus })}
            options={ATTEND_OPTIONS}
            className="h-11 flex-1"
          />
        </span>

        <span className="flex flex-1 items-center gap-2">
          <span className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
            <Coins className="size-3.5 shrink-0" aria-hidden />
            <span className="hidden sm:inline">集金</span>
          </span>
          <SegmentedControl
            aria-label={`${row.user.displayName}の集金`}
            value={row.feeStatus}
            onValueChange={(feeStatus) => onSave({ feeStatus })}
            options={FEE_OPTIONS}
            className="h-11 flex-1"
          />
        </span>
      </div>

      {/* 出欠・集金と同じ形の見出しを付ける。3つの欄の左端が揃う */}
      <div className="mt-2 flex items-center gap-2">
        <span className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
          <StickyNote className="size-3.5 shrink-0" aria-hidden />
          <span className="hidden sm:inline">メモ</span>
        </span>
        <Input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          // **打つたびには送らない。** 離れたときに、変わっていれば送る
          onBlur={() => {
            if (memo !== (row.memo ?? '')) onSave({ memo: memo || null })
          }}
          placeholder="釣り銭・遅刻など"
          className="h-10 flex-1"
          aria-label={`${row.user.displayName}のメモ`}
        />
      </div>

    </li>
  )
}

/**
 * 出欠登録（当日の記録）。
 *
 * **当日その場で、片手で使う画面。** 受付に立って、名乗られた人を探して
 * 押す、の繰り返しになる。だから:
 *
 *   - **押した瞬間に保存する。** 「保存」を押し忘れたまま閉じると
 *     記録が消える。旧画面は3秒後に自動保存するタイマーを持っていて、
 *     離脱の警告まで自前で書いていた
 *   - **並び替えは押した瞬間には行わない。** 触っている行が動くと、
 *     隣の人を間違えて押す
 *   - **未記録を上に出す**（開いたときと、絞り込みを変えたとき）。
 *     当日やることは「まだの人を減らす」こと
 */
export default function AttendanceScreen({ eventId }: { eventId: string }) {
  const { data, isPending, error } = useAttendance(eventId)
  const save = useSaveAttendance(eventId)
  const [filter, setFilter] = React.useState<AttendanceFilter>(NO_FILTER)
  /** いま保存中の人。行ごとに出す */
  const [savingUserId, setSavingUserId] = React.useState<string | null>(null)

  /*
    並び順を固定する。**記録するたびに並び替えない** — 押した行が
    その場で下へ移動すると、次に押す相手を見失う。開いたときの順
    （未記録が上）で固定し、絞り込みを変えたときだけ組み直す。
  */
  const rows = data?.rows
  // 依存に式を直接書かない（`react-hooks` が「単純な式で」と言う）
  const hasRows = rows !== undefined
  const order = React.useMemo(
    () => (rows ? [...rows].sort(byUnenteredFirst).map((r) => r.userId) : []),
    // 絞り込みが変わったときに組み直す。行の中身では組み直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasRows, filter.query, filter.attend, filter.fee]
  )

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
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
            ? 'このイベントの出欠を記録する権限がありません。'
            : '出欠を読み込めませんでした。'}
        </p>
      </div>
    )
  }

  const summary = summarize(data.rows)
  const position = new Map(order.map((id, i) => [id, i]))
  const visible = filterRows(data.rows, filter).sort(
    (a, b) => (position.get(a.userId) ?? 0) - (position.get(b.userId) ?? 0)
  )

  const onSave = (userId: string, input: Omit<SaveAttendanceInput, 'userId'>) => {
    setSavingUserId(userId)
    save.mutate(
      { ...input, userId },
      {
        onSettled: () => setSavingUserId(null),
        onError: (e) => {
          toast.error(
            e instanceof ApiClientError
              ? (e.details?.[0]?.message ?? e.message)
              : '記録に失敗しました'
          )
        },
      }
    )
  }

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
        出欠登録
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{data.event.title}</p>

      {/*
        集計は上に固定して出す。**「あと何人か」が受付の進み具合そのもの。**
        参加費はここに出す — 当日いくら受け取るのかを毎回思い出さずに済む
      */}
      <div className="sticky top-0 z-30 -mx-4 mt-4 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-medium text-foreground">
            出席 {summary.present} / {summary.total}
          </span>
          <span className={cn(summary.notEntered > 0 ? 'text-foreground' : 'text-muted-foreground')}>
            未記録 {summary.notEntered}
          </span>
          <span className="text-muted-foreground">欠席 {summary.absent}</span>
          <span className="text-muted-foreground">
            集金 {summary.paid}
            {summary.unpaid > 0 ? `（未払 ${summary.unpaid}）` : ''}
          </span>
          {data.event.fee ? (
            <span className="text-muted-foreground">参加費 {data.event.fee}</span>
          ) : null}
        </div>

        <div className="relative mt-2">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={filter.query}
            onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
            placeholder="名前・ユーザー名で絞り込む"
            className="h-11 pl-9"
            aria-label="参加者を絞り込む"
          />
          {filter.query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="名前の絞り込みを消す"
              className="absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground"
              onClick={() => setFilter((f) => ({ ...f, query: '' }))}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>

        {/*
          状態での絞り込み。**行の操作と同じ形・同じ語彙**にして、
          「いま何で絞っているか」と「これから何を押すか」を同じ目で読める
          ようにする。「出席したのに未払」を探すために2つを重ねられる。
        */}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <span className="flex flex-1 items-center gap-2">
            <span className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
              <ClipboardList className="size-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">出欠</span>
            </span>
            <SegmentedControl
              aria-label="出欠で絞り込む"
              value={filter.attend}
              onValueChange={(attend) => setFilter((f) => ({ ...f, attend }))}
              options={ATTEND_FILTERS}
              className="h-9 flex-1"
            />
          </span>

          <span className="flex flex-1 items-center gap-2">
            <span className="flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-muted-foreground">
              <Coins className="size-3.5 shrink-0" aria-hidden />
              <span className="hidden sm:inline">集金</span>
            </span>
            <SegmentedControl
              aria-label="集金で絞り込む"
              value={filter.fee}
              onValueChange={(fee) => setFilter((f) => ({ ...f, fee }))}
              options={FEE_FILTERS}
              className="h-9 flex-1"
            />
          </span>
        </div>

        {/*
          **絞っていることと、隠れている人数を必ず出す。** 出さないと
          「参加者が減った」と読めてしまう（受付中はいちばん困る）。
        */}
        {isFiltering(filter) ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {summary.total}人中 {visible.length}人を表示
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="text-primary"
              onClick={() => setFilter(NO_FILTER)}
            >
              絞り込みを解除
            </Button>
          </div>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {data.rows.length === 0
            ? 'まだ参加者がいません。'
            : '絞り込みに合う参加者がいません。'}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {visible.map((row) => (
            <Row
              key={row.userId}
              row={row}
              saving={savingUserId === row.userId}
              onSave={(input) => onSave(row.userId, input)}
            />
          ))}
        </ul>
      )}

      {summary.notEntered === 0 && summary.total > 0 ? (
        <p className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4" aria-hidden />
          全員の出欠を記録しました
        </p>
      ) : null}
    </div>
  )
}
