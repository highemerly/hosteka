'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  Clock,
  Link2,
  Mail,
  MapIcon,
  MapPin,
  MessageSquare,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConditionLink } from '@/components/event/ConditionLink'
import { EventInfoRow } from '@/components/event/EventInfoRow'
import { resolveLocation } from '@/components/event/location'
import { formatJstDateTime } from '@/lib/jst'

import { formatRemaining } from './remaining-time'

/**
 * イベントと日程調整で共有する詳細ページの部品。
 *
 * **どちらの画面も同じ姿にする。** 締切の出し方や場所の行が別々だと、
 * 利用者は同じ情報を2通りの見た目で読み分けることになる。
 * 参加の形（1人1行の5状態 vs 日程ごとの○△×）だけは共有しない。
 */

/**
 * 題名の下に並ぶ、幹事の2つのボタンの既定の幅。
 *
 * **狭い画面でも横に並べる。** 縦に積むと題名の下がボタン2つ分の高さで
 * 埋まり、日時も場所も画面の外へ押し出される。幅は半分ずつ分け合う
 * （`flex-1`。`min-w-0` が無いと最小内容幅で押し合って溢れる）。
 *
 * 横に詰めるとラベルが1行に収まらないので、**狭い画面では折り返す**
 * （`whitespace-normal` と成り行きの高さ）。切ると
 * 「満員のため受付を終了しました」が何の話か読めなくなる。
 * 高さは呼び出し側の `items-stretch` で揃える。
 */
export const HOST_ACTION_WIDTH = [
  'min-w-0 flex-1',
  'max-sm:h-auto max-sm:min-h-12 max-sm:px-3 max-sm:py-2',
  'max-sm:text-sm max-sm:leading-snug max-sm:whitespace-normal',
  'max-sm:[&_svg]:size-4',
  'sm:w-auto sm:flex-none sm:min-w-56',
].join(' ')

/** 節の間隔。詰めると見出しが本文に埋もれる */
export function Space() {
  return <div className="h-8" />
}

/**
 * 下書きを描いているか。
 *
 * `preview` では**行き先のある要素をリンクにしない**。押すと入力途中の
 * フォームから離れてしまうし、まだ存在しないページの URL は作れない。
 * 見た目は変えない — 押せないことより「本番でどう見えるか」が主題。
 */
export type DetailVariant = 'live' | 'preview'

/**
 * 回答締切。**残り時間を畳んだ状態で見せ、正確な日時はモーダルで出す。**
 * 「あと3日2時間」は決める材料になるが、「2026年9月12日（土）19:00」は
 * 予定と突き合わせるときにしか要らない。
 */
export function DeadlineCondition({ deadline }: { deadline: string }) {
  // 残り時間は描画のたびに変わる。マウント後に計算してSSRとの食い違いを避ける
  const [remaining, setRemaining] = React.useState<string | null>(null)

  React.useEffect(() => {
    const update = () => setRemaining(formatRemaining(new Date(deadline).getTime() - Date.now()))
    update()
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
  }, [deadline])

  return (
    <ConditionLink
      icon={<Clock className="size-3.5" />}
      tone="warning"
      label={
        <>
          回答締切{' '}
          {remaining ?? (
            <span
              className="inline-block h-3 w-16 animate-pulse rounded bg-primary/30"
              aria-label="読み込み中"
            />
          )}
        </>
      }
      title="回答締切"
    >
      <p className="text-sm text-foreground">
        {formatJstDateTime(deadline, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
    </ConditionLink>
  )
}

/**
 * 情報行の右端に置く操作ボタン。
 *
 * **狭い画面ではアイコンだけにする。** 情報行は左に本文（場所や日時）を
 * 抱えているので、スマホ幅でラベルまで出すと本文の折り返しを押し潰す。
 * 行き先はアイコンで足りる（カレンダー＝予定に入れる、外部リンク＝地図）ので、
 * ラベルは読める幅があるときだけ添える。
 *
 * ラベルは消しても `aria-label` に残す。**アイコンだけのボタンを
 * 名前の無いボタンにしない。**
 */
export function InfoRowAction({
  icon,
  label,
  href,
  external = false,
  className = '',
  preview,
}: {
  icon: React.ReactNode
  label: string
  href: string
  /** 別タブで開くか。地図は外部サイトなので開く */
  external?: boolean
  /** 置き場所に合わせた横幅。操作列に再掲するときは他と一緒に広がる */
  className?: string
  /** プレビューでは押せない。押した先で入力途中のフォームが失われる */
  preview: boolean
}) {
  const inertProps = preview ? ({ 'aria-disabled': true, tabIndex: -1 } as const) : {}

  const content = (
    <>
      {icon}
      <span className="max-sm:hidden">{label}</span>
    </>
  )

  return (
    <Button
      variant="default"
      size="sm"
      asChild={!preview}
      aria-label={label}
      title={label}
      className={`max-sm:w-9 max-sm:px-0 ${className} ${preview ? 'pointer-events-none' : ''}`}
      {...inertProps}
    >
      {preview ? (
        content
      ) : (
        <a href={href} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {content}
        </a>
      )}
    </Button>
  )
}

/**
 * 連絡の入口。
 *
 * 行き先は2つある。**主催者へ**（anypost.dev でメンションを下書きする）と、
 * **参加者全員へ**（このサイトの連絡画面）。後者は幹事メニューにも同じ
 * 行き先があるが、参加している人なら誰でも送れる（サーバーがそう決めている
 * ので、幹事だけに見せると出せる人に入口が無いことになる）。
 *
 * **行き先がいくつでも、必ず「連絡」のプルダウンを介す。** 行き先の名前を
 * ボタンに直接出すと横幅が伸び、スマホの操作列が崩れる。使えない行き先
 * （自分しか宛先がいない・Discord でメンションが届かない・参加していない）は
 * 項目をグレーアウトする。どちらも使えないときだけ入口ごと出さない。
 */
export function ContactAction({
  onContactOrganizer,
  participantsHref,
  participantsLabel,
  className = '',
  preview = false,
}: {
  /** 主催者へのメンションを開く。自分以外に宛先がいなければ null */
  onContactOrganizer: (() => void) | null
  /** 参加者全員への連絡画面。開けない閲覧者には null */
  participantsHref: string | null
  /** 「参加者全員に連絡」/「回答者全員に連絡」。画面で相手の呼び方が違う */
  participantsLabel: string
  /** 置き場所に合わせた横幅。操作列では他のボタンと一緒に広がる */
  className?: string
  /** プレビューでは押せない。押した先で入力途中のフォームが失われる */
  preview?: boolean
}) {
  const inertProps = preview ? ({ 'aria-disabled': true, tabIndex: -1 } as const) : {}
  const buttonClass = `${className} ${preview ? 'pointer-events-none' : ''}`

  if (!onContactOrganizer && !participantsHref) return null

  const participantsContent = (
    <>
      <MessageSquare className="size-4" />
      {participantsLabel}
    </>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* ラベルは行き先を含めない。開くまで決まらないので「連絡」だけ */}
        <Button variant="default" size="sm" className={buttonClass} {...inertProps}>
          <Mail className="size-4" />
          連絡
          <ChevronDown className="size-4 opacity-70" data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuItem
          onSelect={onContactOrganizer ?? undefined}
          disabled={!onContactOrganizer}
        >
          <Mail className="size-4" />
          主催者へ連絡
        </DropdownMenuItem>
        <DropdownMenuItem
          asChild={Boolean(participantsHref) && !preview}
          disabled={!participantsHref || preview}
        >
          {participantsHref && !preview ? (
            <Link href={participantsHref}>{participantsContent}</Link>
          ) : (
            participantsContent
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 場所の行。
 *
 * **リアルの会場とオンラインの会場を1行で扱う。** 判定は
 * `resolveLocation`（入力欄と共有）。住所なら右端に地図ボタン、
 * URLなら文字そのものをリンクにする。
 *
 * URLに地図ボタンを付けない／住所の文字をリンクにしない、という
 * 描き分けは意図的。**同じ行き先への入口を2つ置かない。**
 * 長いURLは押せる見た目のほうが自然で、住所は本文として読ませたい。
 */
export function LocationRow({ location, preview }: { location: string; preview: boolean }) {
  const resolved = resolveLocation(location)

  const text = resolved.linkText ? (
    /* 色は本番と同じにする。「リンクとして出るかどうか」も
       プレビューで確かめたいことのひとつ */
    preview ? (
      <span className="break-all text-primary">{location}</span>
    ) : (
      <a href={resolved.href} className="break-all text-primary hover:underline">
        {location}
      </a>
    )
  ) : (
    location
  )

  return (
    <EventInfoRow
      icon={
        resolved.kind === 'url' ? <Link2 className="size-4" /> : <MapPin className="size-4" />
      }
      action={
        /* **地図の絵にする。** 外部リンクの矢印では、押した先が地図なのか
           主催者のサイトなのかが読めない（スマホではラベルが畳まれて
           アイコンだけになる） */
        resolved.kind === 'place' ? (
          <InfoRowAction
            icon={<MapIcon className="size-4" />}
            label="地図"
            href={resolved.href}
            external
            preview={preview}
          />
        ) : undefined
      }
    >
      {text}
    </EventInfoRow>
  )
}
