'use client'

import * as React from 'react'
import { CalendarDays, Plus, Trash2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useConfirm } from '@/components/common/ConfirmDialog'
import { cn } from '@/lib/utils'

import { DateCalendar } from './DateCalendar'
import {
  byDateTime,
  dateOptionKey,
  type DateOptionDraft,
  endsNextDay,
  formatDay,
  formatTimeRange,
  orUndefined,
  shouldShowEnd,
  shouldShowTime,
  spanDays,
  spanEndLabel,
  weekdayLabel,
  withSpanDays,
  withStartDate,
} from './date-option'

export type { DateOptionDraft } from './date-option'

/** 候補が0件でも欄を1つ出す。イベントの「開催日」欄と同じ見え方にする */
const BLANK: DateOptionDraft = { startDate: '' }

/**
 * 候補日の入力。
 *
 * **イベントの「開催日」欄（`EventFormScreen`）と同じ形を並べる。**
 * 日付の欄があって、要る人だけが `＋時刻を指定` `＋終了日時を指定` で欄を足す。
 * 部品も語彙も揃えてあるので、片方を使えばもう片方も読める。
 *
 * ### 欄は「開始」と「終了」で分ける
 *
 * `＋時刻を指定` が出すのは**開始時刻だけ**。「19:00から」で足りる候補は
 * 多く、終了時刻まで出すと、要らない欄を毎回空のまま通ることになる。
 * 終了時刻は終了日と同じ `＋終了日時を指定` が持つ — どちらも「いつ終わるか」
 * なので、`[開始日][開始時刻] 〜 [終了日][終了時刻]` で1本の並びになる。
 *
 * ### 引き継ぎは「追加したときだけ」
 *
 * `＋候補を追加` を押すと、**直前の候補の時刻がそのまま入って出てくる**。
 * 終了日も同じで、直前が3日間なら日付を入れた時点で3日間になる。
 * 候補ごとに時刻が違うことは少ないので、毎回打たせない。
 *
 * **既にある候補は、他の候補を直しても変わらない。** 以前は「前の既定値の
 * ままの候補は付いてくる」という規則だったが、どれが付いてきてどれが
 * 取り残されるのかが画面から読めなかった。押した瞬間しか動かないなら、
 * 見たままになる。
 *
 * ### `＋◯◯を指定` は「欄を出す」操作
 *
 * 値は入れない。押すと全行に欄が出るだけで、中身は空のまま。
 * 値を入れる操作にすると、押した行にだけ時刻が付いて他の行には欄すら
 * 無い状態になり、直す手段が無くなる。`×` で欄ごと畳むと値も消える。
 *
 * ### カレンダーは「候補日をまとめて入力」の中
 *
 * 最初から升目を出さない。候補を5つ6つ挙げるときは速いが、
 * 1つか2つで済む人には場所を取るだけで、画面が入力欄だらけに見える。
 * **中に時刻の欄と `＋指定` を持つ** ので、先に日を選んでから時刻を
 * 決める順番でも、一度閉じずに済む。切り替えているのは一覧と同じ状態。
 */
export function DateOptionsField({
  options,
  onChange,
  answeredCounts,
  error,
  rowErrors,
}: {
  options: DateOptionDraft[]
  onChange: (next: DateOptionDraft[]) => void
  /**
   * 既に回答が付いた候補（`dateOptionKey` → 回答数）。
   *
   * **これらは日付も時刻も変えられない。** 保存時、サーバーは候補日を
   * 作り直したうえで「開始・終了が完全に一致する候補」へ回答を移す
   * （`api/v1/pre-events/[id]` の PUT）。1分でもずらすと移し先が
   * 見つからず、回答が黙って消える。
   *
   * 外すことはできる（候補から降ろすのは主催者の判断）。ただし回答も
   * 一緒に消えるので、消える件数を見せて確かめる。
   */
  answeredCounts?: Record<string, number>
  error?: string
  /** 行ごとのエラー。添字で引く（`dateOptions.0.startDate` を平らにしたもの） */
  rowErrors?: Record<number, string>
}) {
  const confirm = useConfirm()
  const [bulkOpen, setBulkOpen] = React.useState(false)

  /*
    欄を出すか。**マウント時に決め打ちできない。**
    編集画面ではフォームの初期値が空で、保存済みの候補は `reset()` で
    あとから流し込まれる。マウント時の値で決めると、時刻を持つ候補を
    開いても欄が出ず、**時刻が消えたように見える**（実際そうなっていた）。

    利用者が「◯◯を指定」「指定をやめる」を押したらその判断を優先し、
    押されていない間は値のほうに従う。
  */
  const [timeMode, setTimeMode] = React.useState<boolean | null>(null)
  const withTime = shouldShowTime(timeMode, options)
  const [endMode, setEndMode] = React.useState<boolean | null>(null)
  const withEnd = shouldShowEnd(endMode, options)

  /** 終了の欄が持つもの。時刻を使っていなければ日付だけ */
  const endLabel = withTime ? '終了日時' : '終了日'

  /** 「まとめて入力」で選ぶ日に付ける時刻 */
  const [bulkStart, setBulkStart] = React.useState('')
  const [bulkEnd, setBulkEnd] = React.useState('')
  /** それを開いてから足した日。時刻の欄を直すとこれらに入る */
  const pickedRef = React.useRef<Set<string>>(new Set())

  /** 足した行へ焦点を移す。**打ち始められる状態で渡す**（探させない） */
  const focusRow = React.useRef<number | null>(null)
  React.useEffect(() => {
    const index = focusRow.current
    if (index == null) return
    focusRow.current = null
    document.getElementById(`dateOptions.${index}.startDate`)?.focus()
  })

  const answered = answeredCounts ?? {}
  const countOf = (option: DateOptionDraft) => answered[dateOptionKey(option)] ?? 0

  const rows = options.length > 0 ? options : [BLANK]
  const selected = options.map((o) => o.startDate).filter(Boolean)

  /** 回答が付いた候補を1つでも持つ日。カレンダーからは外せない */
  const lockedDates = Array.from(
    new Set(options.filter((o) => countOf(o) > 0).map((o) => o.startDate))
  )

  /**
   * `＋指定` と `×` を置く行。
   *
   * **回答が付いた候補は入力欄を持てない**（日時を文字で見せている）ので、
   * 先頭ではなく「先頭の、まだ回答が付いていない候補」に置く。
   */
  const shapeRow = rows.findIndex((o) => countOf(o) === 0)

  /** 直前の候補。`＋候補を追加` と「まとめて入力」が、ここから引き継ぐ */
  const previous = (): DateOptionDraft | undefined => options[options.length - 1]

  /**
   * 直前の候補の日数。**追加した時点では入れられない**（日付がまだ無い）ので、
   * 日付が決まった時点で引き継ぐ。
   */
  const inheritedSpan = (index: number) => {
    if (!withEnd) return 1
    const before = rows[index - 1]
    return before ? spanDays(before) : 1
  }

  const updateOption = (index: number, patch: Partial<DateOptionDraft>) => {
    onChange(rows.map((o, i) => (i === index ? { ...o, ...patch } : o)))
  }

  /** その日の候補をまとめて外す。カレンダーの升目はこの単位で押される */
  const removeDate = async (date: string) => {
    const onDate = options.filter((o) => o.startDate === date)
    const answers = onDate.reduce((sum, o) => sum + countOf(o), 0)

    // 1枠だけで回答も無いなら黙って外す。押した通りのことしか起きない
    if (answers > 0 || onDate.length > 1) {
      const ok = await confirm({
        title: `${formatDay(date)}を候補から外しますか？`,
        description:
          answers > 0
            ? `この日に届いている回答${answers}件も一緒に消えます。元に戻せません。`
            : `この日の候補${onDate.length}枠をまとめて外します。`,
        confirmLabel: '候補から外す',
        destructive: true,
      })
      if (!ok) return
    }
    pickedRef.current.delete(date)
    onChange(options.filter((o) => o.startDate !== date))
  }

  /** 1枠だけ外す。一覧のごみ箱から */
  const removeRow = async (index: number) => {
    const option = options[index]
    const count = countOf(option)
    if (count > 0) {
      const ok = await confirm({
        title: `${formatDay(option.startDate)} ${formatTimeRange(option)}を候補から外しますか？`,
        description: `この候補に届いている回答${count}件も一緒に消えます。元に戻せません。`,
        confirmLabel: '候補から外す',
        destructive: true,
      })
      if (!ok) return
    }
    onChange(options.filter((_, i) => i !== index))
  }

  /**
   * カレンダーの升目。**「その日を候補にするか」だけを切り替える** —
   * 押すたびに枠が増えると、押し間違えたのか増やしたのかが分からない。
   * 同じ日にもう1枠立てたいときは `＋候補を追加` から同じ日付を打つ。
   */
  const toggle = (date: string) => {
    if (options.some((o) => o.startDate === date)) {
      if (lockedDates.includes(date)) return
      void removeDate(date)
      return
    }
    const added = withSpanDays(
      {
        startDate: date,
        startTime: orUndefined(bulkStart),
        endTime: withEnd ? orUndefined(bulkEnd) : undefined,
      },
      withEnd ? spanDays(previous() ?? BLANK) : 1
    )
    pickedRef.current.add(date)
    onChange([...options, added].sort(byDateTime))
  }

  /**
   * 「まとめて入力」の時刻。**そこで選んだ日すべてに入る** —
   * 先に日を選んでから時刻を決める順番でも、打ち直さずに済む。
   * 開く前からあった候補には触らない。
   */
  const changeBulkTime = (
    key: 'startTime' | 'endTime',
    value: string,
    setBulk: (v: string) => void
  ) => {
    setBulk(value)
    if (value) setTimeMode(true)
    const picked = pickedRef.current
    if (picked.size === 0) return
    onChange(
      options.map((o) =>
        picked.has(o.startDate) && countOf(o) === 0 ? { ...o, [key]: orUndefined(value) } : o
      )
    )
  }

  const openBulk = () => {
    const before = previous()
    setBulkStart(before?.startTime ?? '')
    setBulkEnd(before?.endTime ?? '')
    pickedRef.current = new Set()
    setBulkOpen(true)
  }

  /**
   * 行の開始日を決める。
   *
   * 終了日を持つ行は**日数を保って動かす**（終了日を据え置くと開始より前になる）。
   * まだ持たない行は**直前の候補の日数を引き継ぐ** — `＋候補を追加` で足した
   * 行だけ1日のままだと、合宿の候補を挙げるのに毎回終了日を打つことになる。
   */
  const setRowStartDate = (index: number, option: DateOptionDraft, startDate: string) => {
    updateOption(
      index,
      option.endDate
        ? withStartDate(option, startDate)
        : withSpanDays({ ...option, startDate }, inheritedSpan(index))
    )
  }

  /** `＋候補を追加`。直前の候補の時刻を持って出てくる */
  const appendRow = () => {
    const before = previous()
    onChange([
      ...options,
      {
        startDate: '',
        startTime: withTime ? before?.startTime : undefined,
        endTime: withTime && withEnd ? before?.endTime : undefined,
      },
    ])
    focusRow.current = options.length
  }

  /** `×` で欄を畳むときだけ。**回答が付いた候補には触らない**（移し先が消える） */
  const applyToUnanswered = (patch: (o: DateOptionDraft) => DateOptionDraft) => {
    onChange(options.map((o) => (countOf(o) > 0 ? o : patch(o))))
  }

  /**
   * 時刻を使わないという意思表示。終了時刻も一緒に消える（終了日は残す）。
   *
   * **「まとめて入力」が持っている値も捨てる。** 残すと、もう一度
   * 時刻を出したときに畳む前の値が復活して、選んだ日に黙って入る。
   */
  const dropTime = () => {
    setTimeMode(false)
    setBulkStart('')
    setBulkEnd('')
    applyToUnanswered((o) => ({ ...o, startTime: undefined, endTime: undefined }))
  }

  const dropEnd = () => {
    setEndMode(false)
    setBulkEnd('')
    applyToUnanswered((o) => ({ ...o, endDate: undefined, endTime: undefined }))
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {rows.map((option, i) => {
          const count = countOf(option)
          const locked = count > 0
          const isShapeRow = i === shapeRow
          const range = formatTimeRange(option)
          const span = spanEndLabel(option)
          const rowError = rowErrors?.[i]

          return (
            <li
              key={i}
              className={cn(
                'rounded-lg border bg-card px-3 py-2',
                rowError ? 'border-destructive' : 'border-border'
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                {locked ? (
                  /*
                    回答が付いた候補は入力欄にしない。**時刻を1分でも
                    変えると回答の移し先が消える。** 押せる欄を出すと、
                    直せるつもりで直せてしまう。日時は文字で見せる —
                    欄ごと消しただけだと、いつの候補かも消える。
                  */
                  <>
                    <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                      {formatDay(option.startDate)}
                    </span>
                    {span ? <span className="text-sm text-muted-foreground">{span}</span> : null}
                    {range ? (
                      <span className="text-sm tabular-nums text-muted-foreground">{range}</span>
                    ) : null}
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                      回答{count}件
                    </span>
                  </>
                ) : (
                  <>
                    <Input
                      type="date"
                      id={`dateOptions.${i}.startDate`}
                      className="h-9 w-auto"
                      value={option.startDate}
                      onChange={(e) => setRowStartDate(i, option, e.target.value)}
                      aria-label={`${i + 1}番目の候補日`}
                      aria-invalid={rowError ? true : undefined}
                    />
                    <span className="w-7 shrink-0 text-sm text-muted-foreground">
                      {weekdayLabel(option.startDate)}
                    </span>

                    {withTime ? (
                      <span className="flex items-center gap-1">
                        <Input
                          type="time"
                          className="h-9 w-auto"
                          value={option.startTime ?? ''}
                          onChange={(e) =>
                            updateOption(i, { startTime: orUndefined(e.target.value) })
                          }
                          aria-label={`${i + 1}番目の候補の開始時刻`}
                        />
                        {isShapeRow ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="時刻の指定をやめる"
                            title="時刻の指定をやめる"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={dropTime}
                          >
                            <X className="size-4" />
                          </Button>
                        ) : null}
                      </span>
                    ) : null}

                    {withEnd ? (
                      <span className="flex items-center gap-1">
                        <span className="text-sm text-muted-foreground">〜</span>
                        <Input
                          type="date"
                          className="h-9 w-auto"
                          value={option.endDate ?? option.startDate}
                          min={option.startDate || undefined}
                          /*
                            開始日と同じ終了日は持たせない。書くと保存の形が
                            「終了なし」から「その日の0時に終わる」に変わる
                          */
                          onChange={(e) =>
                            updateOption(i, {
                              endDate:
                                e.target.value === option.startDate
                                  ? undefined
                                  : orUndefined(e.target.value),
                            })
                          }
                          aria-label={`${i + 1}番目の候補の終了日`}
                        />
                        <span className="w-7 shrink-0 text-sm text-muted-foreground">
                          {weekdayLabel(option.endDate ?? option.startDate)}
                        </span>
                        {withTime ? (
                          <Input
                            type="time"
                            className="h-9 w-auto"
                            value={option.endTime ?? ''}
                            onChange={(e) =>
                              updateOption(i, { endTime: orUndefined(e.target.value) })
                            }
                            aria-label={`${i + 1}番目の候補の終了時刻`}
                          />
                        ) : null}
                        {isShapeRow ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`${endLabel}の指定をやめる`}
                            title={`${endLabel}の指定をやめる`}
                            className="text-muted-foreground hover:text-foreground"
                            onClick={dropEnd}
                          >
                            <X className="size-4" />
                          </Button>
                        ) : null}
                      </span>
                    ) : null}

                    {/* 日をまたぐことは、時刻の欄だけ見ても分からない */}
                    {endsNextDay(option) ? (
                      <span className="text-xs text-muted-foreground">翌日まで</span>
                    ) : null}

                    <span className="flex-1" />
                  </>
                )}

                {options.length > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    /* 候補の行は狭い。横幅を1段落として日付欄に回す */
                    size="icon-xs"
                    aria-label={
                      option.startDate
                        ? `${formatDay(option.startDate)}${range ? ` ${range}` : ''}を候補から外す`
                        : `${i + 1}番目の候補を外す`
                    }
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(i)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </div>

              {/*
                欄を出す操作は1か所だけ。**行ごとに置くと候補の数だけ並ぶ。**
                イベントの開催日欄と同じく、日付の下に回す
              */}
              {isShapeRow && !(withTime && withEnd) ? (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {!withTime ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-primary"
                      onClick={() => setTimeMode(true)}
                    >
                      <Plus className="size-4" />
                      時刻を指定
                    </Button>
                  ) : null}
                  {!withEnd ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-primary"
                      onClick={() => setEndMode(true)}
                    >
                      <Plus className="size-4" />
                      {endLabel}を指定
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {rowError ? (
                <p role="alert" className="mt-1 text-sm font-medium text-destructive">
                  {rowError}
                </p>
              ) : null}
            </li>
          )
        })}
      </ul>

      {/*
        **横に並べない。** 一覧に足す `＋候補を追加` は文字のリンクで、
        まとめて入力は面のあるボタン。同じ行に置くと、形の違う2つが
        同じ重さの選択肢に見えて落ち着かない
      */}
      <div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-primary"
          onClick={appendRow}
        >
          <Plus className="size-4" />
          候補を追加
        </Button>
      </div>

      <div>
        <Button type="button" variant="default" size="sm" onClick={openBulk}>
          <CalendarDays className="size-4" />
          候補日をまとめて入力
        </Button>
      </div>

      {lockedDates.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          回答が届いている候補は日時を変更できません。変えたい場合は一度外して、
          新しい候補として足してください（その候補の回答は消えます）。
        </p>
      ) : null}

      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>候補日をまとめて入力</DialogTitle>
          </DialogHeader>

          <DateCalendar selected={selected} locked={lockedDates} onToggle={toggle} />

          {/*
            **一覧と同じ `＋指定 / ×` を出す。** 出していないと、時刻を使うか
            どうかを決めるために一度閉じることになる。押した結果が一覧側の
            欄にも出るのは、同じ状態を切り替えているから。

            ここに終了「日」の欄は無い（升目で選んだ日が開始日で、
            終了日は候補ごとに違う）。まとめて決められるのは時刻のほう。
          */}
          {withTime ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">時刻</span>
              <Input
                type="time"
                className="w-auto"
                value={bulkStart}
                onChange={(e) => changeBulkTime('startTime', e.target.value, setBulkStart)}
                aria-label="選んだ候補の開始時刻"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="時刻の指定をやめる"
                title="時刻の指定をやめる"
                className="text-muted-foreground hover:text-foreground"
                onClick={dropTime}
              >
                <X className="size-4" />
              </Button>
              {withEnd ? (
                <>
                  <span className="text-sm text-muted-foreground">–</span>
                  <Input
                    type="time"
                    className="w-auto"
                    value={bulkEnd}
                    onChange={(e) => changeBulkTime('endTime', e.target.value, setBulkEnd)}
                    aria-label="選んだ候補の終了時刻"
                  />
                </>
              ) : null}
            </div>
          ) : null}

          {!(withTime && withEnd) ? (
            <div className="flex flex-wrap items-center gap-1">
              {!withTime ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-primary"
                  onClick={() => setTimeMode(true)}
                >
                  <Plus className="size-4" />
                  時刻を指定
                </Button>
              ) : null}
              {!withEnd ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-primary"
                  onClick={() => setEndMode(true)}
                >
                  <Plus className="size-4" />
                  {endLabel}を指定
                </Button>
              ) : null}
              {withEnd ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={dropEnd}
                >
                  <X className="size-4" />
                  {endLabel}の指定をやめる
                </Button>
              ) : null}
            </div>
          ) : null}

          <Button type="button" variant="primary" onClick={() => setBulkOpen(false)}>
            決定
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
