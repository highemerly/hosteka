'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronDown, Crown, ListFilter, Users, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useIsTruncated } from '@/hooks/useIsTruncated'
import { useMediaQuery } from '@/hooks/useMediaQuery'

import { UserAvatar } from './EventInfoRow'

export type ParticipantStatusView =
  | 'attending'
  | 'maybe'
  | 'participation_request'
  | 'not_attending'
  | 'cancelled'

export type ParticipantView = {
  id: string
  name: string
  handle: string
  avatar: string | null
  isHost: boolean
  status: ParticipantStatusView
  comment?: string
  options?: ParticipantOptionView[]
  /** Hosteka の中のプロフィールページ。無ければ名前をリンクにしない */
  profileHref?: string
}

export type ParticipantOptionView = { question: string; name: string }

/** 絞り込みに出すオプション。並びはイベントの表示順 */
export type ParticipantOptionGroupView = { title: string; options: { name: string }[] }

/*
  絞り込みの条件は「見出し＋選択肢の名前」で突き合わせる。
  見出しの重複と、見出しの中での名前の重複はフォームで弾いている（schemas/event.ts）。
*/
const sameOption = (a: ParticipantOptionView, b: ParticipantOptionView) =>
  a.question === b.question && a.name === b.name

const hasOption = (p: ParticipantView, o: ParticipantOptionView) =>
  p.options?.some((x) => sameOption(x, o)) ?? false

/**
 * 参加以外の回答。**この順で出す。**
 * 主催者が知りたい順（まだ動くもの → 動かないもの）に並べる。
 */
const OTHER_STATUSES: { status: ParticipantStatusView; label: string }[] = [
  { status: 'participation_request', label: '参加リクエスト' },
  { status: 'maybe', label: '未定' },
  { status: 'not_attending', label: '欠席' },
  { status: 'cancelled', label: 'キャンセル' },
]

/**
 * 畳んだ状態で詳細まで出す人数。
 * 画面幅で変える。狭い画面で12人分並べると、説明までスクロールが遠くなる。
 */
const VISIBLE_COUNT_MOBILE = 3
const VISIBLE_COUNT_DESKTOP = 12

const STATUS_LABEL: Record<ParticipantStatusView, string | null> = {
  // 参加はこの一覧の既定なので、わざわざ札を付けない
  attending: null,
  maybe: '未定',
  participation_request: '参加リクエスト',
  not_attending: '欠席',
  cancelled: 'キャンセル',
}

/**
 * 選んだオプションのチップ。
 *
 * **必ず1行に収める。** 段組みの1マスは狭く、選択肢が多い人だけ行が
 * 伸びると並びがガタつく。高さを1行分に固定して折り返しを許すと、
 * 収まらないチップは丸ごと2行目へ回って隠れる（途中で切れない）。
 * 1つだけで幅を超えるチップは末尾を省略する。
 *
 * チップには選択肢の名前しか出さない（「はい」だけでは何の答えか
 * 分からない）ので、**押すとその人の回答を質問付きですべて出す。**
 * 隠れたチップもここで読める。
 *
 * 参加者の編集画面でも同じものを使う。
 */
export function OptionChips({
  name,
  options,
  highlight = null,
}: {
  name: string
  options: ParticipantOptionView[]
  /** 絞り込み中の条件。一致したチップを先頭へ回して濃くする */
  highlight?: ParticipantOptionView | null
}) {
  /*
    **一致したチップは先頭へ回す。** 1行で切るので、後ろにあると隠れて
    「なぜこの人が残ったのか」が見えなくなる。
  */
  const chips = highlight
    ? [...options].sort(
        (a, b) => Number(sameOption(b, highlight)) - Number(sameOption(a, highlight))
      )
    : options
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${name}の回答を表示`}
          className="mt-1 flex h-5 w-full flex-wrap gap-1 overflow-hidden text-left"
        >
          {chips.map((o) => (
            <span
              key={`${o.question}\u0000${o.name}`}
              title={`${o.question}：${o.name}`}
              className={`max-w-full truncate rounded-lg bg-muted px-1.5 py-0.5 text-[11px] leading-4 ${
                // 絞り込みは表示の切り替えなので青にしない（DESIGN_GUIDELINES §8）
                highlight && sameOption(o, highlight)
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {o.name}
            </span>
          ))}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <dl className="space-y-2 text-xs">
          {options.map((o) => (
            <div key={`${o.question}\u0000${o.name}`}>
              <dt className="text-muted-foreground">{o.question}</dt>
              <dd className="text-foreground">{o.name}</dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}

/**
 * 参加者のコメント。**1行で切り、切れたときだけ末尾の「…」を押せるようにする。**
 *
 * 全文を並べると、長いコメントが数人分続いただけで一覧が読めなくなる。
 * かといって切ったままだと、読む手段が無い。
 *
 * 全文はその場で広げずポップオーバーで出す。一覧は段組みなので、
 * 1人分が伸びると他の人が別の列へ流れて、読んでいた位置を見失う。
 * オプションの回答（`OptionChips`）と同じ出し方。
 *
 * 「…」は文字の省略記号（text-overflow）ではなく押せる札として置く。
 * そのぶん文字は端でぼかして切る（字の途中で断ち切れて見えないように）。
 */
function ParticipantComment({ name, comment }: { name: string; comment: string }) {
  const [ref, truncated] = useIsTruncated<HTMLParagraphElement>()
  return (
    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
      <p
        ref={ref}
        className={`min-w-0 overflow-hidden whitespace-nowrap ${
          truncated ? '[mask-image:linear-gradient(to_right,black_calc(100%-1rem),transparent)]' : ''
        }`}
      >
        {comment}
      </p>
      {truncated ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${name}のコメントを全文表示`}
              className="shrink-0 rounded-lg bg-muted px-1.5 text-[11px] leading-4 text-muted-foreground transition-colors hover:text-foreground"
            >
              …
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <p className="text-sm break-words whitespace-pre-wrap text-foreground">{comment}</p>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  )
}

function ParticipantRow({
  p,
  showStatus = true,
  highlight = null,
}: {
  p: ParticipantView
  highlight?: ParticipantOptionView | null
  /**
   * 状態の札を出すか。
   *
   * **見出しで既に状態を言っている並びでは出さない。**
   * 「参加リクエスト（3）」の下に「参加リクエスト」の札が3つ続くのは、
   * 同じことを4回言っているだけで、名前を読む邪魔になる。
   */
  showStatus?: boolean
}) {
  const statusLabel = showStatus ? STATUS_LABEL[p.status] : null
  return (
    <li className="flex items-start gap-3 py-2.5">
      <UserAvatar name={p.name} src={p.avatar} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {p.profileHref ? (
            <Link
              href={p.profileHref}
              className="truncate text-sm font-medium text-foreground hover:underline"
            >
              {p.name}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
          )}
          {p.isHost ? (
            <Crown className="size-3.5 shrink-0 text-primary" aria-label="主催者" />
          ) : null}
          {statusLabel ? (
            <span className="shrink-0 rounded-lg border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {statusLabel}
            </span>
          ) : null}
        </div>
        {p.comment ? <ParticipantComment name={p.name} comment={p.comment} /> : null}
        {p.options?.length ? <OptionChips name={p.name} options={p.options} highlight={highlight} /> : null}
      </div>
    </li>
  )
}

/**
 * 畳んだ内容を開く行。
 *
 * **参加者の「ほか●人」と、参加以外の回答で同じ形を使う。** 同じ操作が
 * 別の姿で2つ並ぶと、片方だけ押せるものだと思われる。
 * 畳んでいる間は顔を並べ、右端にラベルと矢印を置く。
 */
function DisclosureRow({
  people,
  label,
  expanded,
  onToggle,
  ariaLabel,
  divider = true,
}: {
  people: ParticipantView[]
  label: React.ReactNode
  expanded: boolean
  onToggle: () => void
  ariaLabel: string
  /**
   * 上に罫線を引くか。
   *
   * **参加者の続き（「ほか●人を表示」）では引かない。** 同じ「参加」の
   * 並びが途中で切られ、畳んだ分が別の区分に見える。
   * 線が要るのは、参加以外の回答のように**中身が変わる**ところだけ。
   *
   * その参加以外の回答も、開いている間は引かない。境目は中身の上へ移り、
   * この行は中身の下（畳む操作の位置）へ回る。
   */
  divider?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={ariaLabel}
      className={
        divider ? 'group rule-t mt-3 w-full pt-3 text-left' : 'group mt-1 w-full text-left'
      }
    >
      <span className="flex flex-wrap items-center gap-1.5">
        {/*
          畳んでいる人もアイコンだけは全員出す。
          「あと15人」と数字で言われるより、顔が並んでいる方が
          規模と顔ぶれが一目で分かる。
        */}
        {!expanded &&
          people.map((p) => (
            <span key={p.id} title={`${p.name}（${p.handle}）`}>
              <UserAvatar name={p.name} src={p.avatar} size="xs" />
            </span>
          ))}
        <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
          {expanded ? '閉じる' : label}
          <ChevronDown className={`size-3.5 ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </span>
    </button>
  )
}

/**
 * オプションで参加者を絞り込むメニュー。
 *
 * 人数は**参加**の人だけを数える。一覧の先頭の「●名」と同じ数え方にしないと、
 * 選んだ瞬間に数字が食い違う。
 */
function OptionFilterMenu({
  groups,
  items,
  value,
  onChange,
}: {
  groups: ParticipantOptionGroupView[]
  items: ParticipantView[]
  value: ParticipantOptionView | null
  onChange: (value: ParticipantOptionView | null) => void
}) {
  /* RadioGroup の値は文字列なので、見出しと名前を区切り文字でつなぐ */
  const SEP = '\u0000'
  const encode = (o: ParticipantOptionView) => `${o.question}${SEP}${o.name}`
  const attending = items.filter((p) => p.status === 'attending')

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="オプションで絞り込む"
          className={`-my-2 ml-auto ${value ? 'text-foreground' : 'text-muted-foreground'}`}
        >
          <ListFilter className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuRadioGroup
          value={value ? encode(value) : ''}
          onValueChange={(v) => {
            if (!v) return onChange(null)
            const [question, name] = v.split(SEP)
            onChange({ question, name })
          }}
        >
          <DropdownMenuRadioItem value="">すべて</DropdownMenuRadioItem>
          {/*
            **選択肢の無い見出しは出さない**（自由入力）。答えが人それぞれなので
            絞り込みの条件にならず、並べると中身の無い見出しだけが残る。
          */}
          {groups
            .filter((g) => g.options.length > 0)
            .map((g) => (
            <React.Fragment key={g.title}>
              <DropdownMenuLabel className="mt-1">{g.title}</DropdownMenuLabel>
              {g.options.map((o) => {
                const option = { question: g.title, name: o.name }
                return (
                  <DropdownMenuRadioItem key={o.name} value={encode(option)}>
                    <span className="min-w-0 flex-1 truncate">{o.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {attending.filter((p) => hasOption(p, option)).length}
                    </span>
                  </DropdownMenuRadioItem>
                )
              })}
            </React.Fragment>
            ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 参加者一覧。
 *
 * **展開してもレイアウトを変えない。** 畳んだ状態と展開した状態で別の
 * 並べ方をすると、押した瞬間に画面が組み替わって視線を失う。
 * 常に同じ行の形を使い、「もっと見る」は行が増えるだけにしてある。
 *
 * 主催者もこの一覧に含め、王冠で示す。
 */
export function ParticipantList({
  items: allItems,
  optionGroups = [],
}: {
  items: ParticipantView[]
  optionGroups?: ParticipantOptionGroupView[]
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [othersOpen, setOthersOpen] = React.useState(false)
  const [filter, setFilter] = React.useState<ParticipantOptionView | null>(null)
  const isDesktop = useMediaQuery('(min-width: 640px)')

  const items = filter ? allItems.filter((p) => hasOption(p, filter)) : allItems
  const allAttendingCount = allItems.filter((p) => p.status === 'attending').length

  /*
    **絞り込んでいる間は畳まない。** 該当者を見るために絞ったのに、
    さらに「ほか●人を表示」を押させることになる。
  */
  const visibleCount = filter
    ? Infinity
    : isDesktop
      ? VISIBLE_COUNT_DESKTOP
      : VISIBLE_COUNT_MOBILE

  /*
    **「参加」だけを表に出す。** 未定・欠席・キャンセルを同じ並びに混ぜると、
    人数を数えるたびに札を読み分けることになる。
    参加以外は畳んだ内側にまとめ、開いたときだけ状態ごとに並べる。
  */
  const attending = items.filter((p) => p.status === 'attending')
  const others = OTHER_STATUSES.map((group) => ({
    ...group,
    people: items.filter((p) => p.status === group.status),
  })).filter((group) => group.people.length > 0)
  const otherCount = others.reduce((sum, g) => sum + g.people.length, 0)

  const visible = expanded ? attending : attending.slice(0, visibleCount)
  const hidden = attending.slice(visibleCount)

  if (allItems.length === 0) {
    return (
      <div className="flex items-start gap-3 py-2">
        <span className="mt-0.5 shrink-0 text-muted-foreground">
          <Users className="size-4" />
        </span>
        <p className="text-sm text-muted-foreground">まだ参加者がいません</p>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 shrink-0 text-muted-foreground">
        <Users className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {/*
          **絞り込みは人数の行に同居させる。** 行を足すと、選択肢の無い
          イベントでも参加者の顔が1行ぶん下がる。ボタンは負のマージンで
          行の高さに収め、条件は1行で省略する。

          **先頭の数は絞っても全体のまま。** 「7名 / 19名」と並べると、
          定員19名に対して参加が7名のように読める。該当者の数は
          括弧の中に「うち●名」で添える。省略するのは条件の文だけで、
          「うち●名」と閉じ括弧は必ず見せる。
        */}
        <div className="flex min-h-5 items-center gap-2">
          <div className="flex min-w-0 items-center text-sm">
            <span className="shrink-0 text-foreground">{allAttendingCount}名</span>
            {filter ? (
              <span className="flex min-w-0 items-center text-muted-foreground">
                <span className="shrink-0">（うち{attending.length}名</span>
                <span
                  className="ml-1 truncate"
                  title={`${filter.question}：${filter.name}`}
                >
                  {filter.question} {filter.name}
                </span>
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  aria-label="絞り込みを解除"
                  className="-my-1 shrink-0 rounded-lg p-1 hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
                <span className="shrink-0">）</span>
              </span>
            ) : null}
          </div>
          {optionGroups.some((g) => g.options.length > 0) ? (
            <OptionFilterMenu
              groups={optionGroups}
              items={allItems}
              value={filter}
              onChange={setFilter}
            />
          ) : null}
        </div>

        {filter && items.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">該当する人はいません</p>
        ) : null}

        {/*
          columns で段組みする。grid だと行の高さが行内の最も高いセルに
          引きずられ、コメントやオプションの有無で列がガタつく。
          columns なら各カラムが独立して詰まる。
        */}
        <ul className="mt-2 sm:columns-2 sm:gap-x-6 lg:columns-3">
          {visible.map((p) => (
            <div key={p.id} className="break-inside-avoid">
              <ParticipantRow p={p} highlight={filter} />
            </div>
          ))}
        </ul>

        {attending.length > visibleCount ? (
          <DisclosureRow
            people={hidden}
            label={`ほか${hidden.length}人を表示`}
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            ariaLabel={
              expanded ? '参加者一覧を閉じる' : `残り${hidden.length}人の参加者を表示`
            }
            divider={false}
          />
        ) : null}

        {/*
          参加以外の回答。参加者の「ほか●人」と同じ形で開く。
          畳んだままでも**内訳の人数はラベルに出す**。「その他」とだけ
          書いて隠すと、開くまで何があるか分からない。
        */}
        {otherCount > 0 ? (
          <>
            {/*
              **開いたら「閉じる」は中身の下へ回す。** 畳む操作は、畳まれる
              範囲の終わりに置く。上に残すと、読み終えた人が閉じるために
              開いた分だけ戻ることになり、すぐ下に次の区分の見出しが
              続いているのか中身の途中なのかも読めない。

              参加者の「ほか●人を表示」は畳んだ分が同じ並びに増えるだけなので、
              こちらは元から中身の下にある。同じ規則で揃う。
            */}
            {othersOpen ? (
              <div className="rule-t mt-3 space-y-3 pt-3">
                {others.map((group) => (
                  <div key={group.status}>
                    <div className="text-xs font-medium text-muted-foreground">
                      {group.label}（{group.people.length}）
                    </div>
                    <ul className="sm:columns-2 sm:gap-x-6 lg:columns-3">
                      {group.people.map((p) => (
                        <div key={p.id} className="break-inside-avoid">
                          {/* 見出しが状態を言っているので、行では繰り返さない */}
                          <ParticipantRow p={p} showStatus={false} highlight={filter} />
                        </div>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : null}

            <DisclosureRow
              people={others.flatMap((g) => g.people)}
              label={`${others.map((g) => `${g.label}${g.people.length}`).join('・')}を表示`}
              expanded={othersOpen}
              onToggle={() => setOthersOpen((v) => !v)}
              ariaLabel={
                othersOpen
                  ? '参加以外の回答を閉じる'
                  : `参加以外の回答${otherCount}件を表示`
              }
              /* 線は「参加」と「参加以外」の境目に引く。開いている間は
                 中身の上が境目なので、下に回った操作には引かない */
              divider={!othersOpen}
            />
          </>
        ) : null}
      </div>
    </div>
  )
}
