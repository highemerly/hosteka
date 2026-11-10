'use client'

import Link from 'next/link'
import {
  ArrowRight,
  CalendarCheck,
  Check,
  ChevronDown,
  Crown,
  Download,
  LogIn,
  Lock,
  MessageSquare,
  Pencil,
  Trash2,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PLATFORM_LABEL, resolvePlatformRestriction } from '@/components/event/allowed-platforms'
import { AllowedAccountTree } from '@/components/event/PlatformCondition'
import type { PlatformRestrictionInput } from '@/components/event/allowed-platforms'
import { HOST_ACTION_WIDTH } from '@/components/attendable/DetailParts'

import type { PreEventActionState } from './resolvePreEventActionState'

export type { PreEventActionState }

/**
 * 回答の操作。
 *
 * **イベントの参加ボタンと同じ姿にする**（大きさ・色・立体）。
 * primary は「押してほしい」、state（同じ青のトーナル）は「もう済んでいる」
 * という使い分けもイベント側と揃える（docs/DESIGN_GUIDELINES.md）。
 *
 * 押せない状態でもボタンを消さない。消すと「操作が無い」のか
 * 「見落としている」のか分からない。理由をラベルに出す。
 */
export function PreEventAction({
  preEventId,
  state,
  selfState,
  restriction,
  widthClassName,
  size = 'default',
  promoted = false,
  canPromote = false,
  onRespond,
  onDelete,
}: {
  /** 幹事メニューの各項目のリンク先を組み立てるのに使う */
  preEventId: string
  /** イベントにしたか。したら幹事メニューから編集を外す（サーバーが断る） */
  promoted?: boolean
  /**
   * 幹事メニューに「イベントにする」を出すか。**削除と同じ人だけ**
   * （作成者と所属グループの管理責任者。`requirePreEventOwner`）
   */
  canPromote?: boolean
  state: PreEventActionState
  /**
   * 幹事自身の回答状態。
   *
   * 幹事の隣に並べる回答ボタンにも、一般の回答者と同じ判定が要る。
   * state だけ見ていると host に潰れて、締切や終了の判定が消える。
   */
  selfState?: PreEventActionState
  restriction?: PlatformRestrictionInput
  /**
   * ボタンの横幅。既定は本文の頭に単独で置く姿（広く取る）。
   * 説明の下の操作列では他のボタンと肩を並べるので、狭い指定を渡す
   * （イベント側の `EventAction` と同じ）。
   */
  widthClassName?: string
  /**
   * ボタンの高さ。
   *
   * 既定（h-12）は**本文の頭に単独で置く姿**。ここは画面で最初に目に入る
   * 操作なので、周りの情報行に合わせて小さくすると押し所が弱くなる。
   * **説明の下の操作列では `sm`**（h-9）— あちらは他のボタンと肩を並べるので、
   * 1つだけ背が高いと列として読めない。
   */
  size?: 'default' | 'sm'
  onRespond?: () => void
  /**
   * 削除。**確認は呼び出し側で取る**（この部品は問い合わせを持たない）。
   * **渡さなければ項目ごと出さない** — グループのスタッフは編集できても
   * 削除はできない（サーバーが拒む。`requirePreEventOwner`）
   */
  onDelete?: () => void
}) {
  if (state.kind === 'host') {
    /*
      2つ並ぶので、単独で置くときより狭い既定にする。
      **どちらも同じ幅にする** — 幅が違うと、片方が主で片方が従に見える。
    */
    const hostWide = widthClassName ?? HOST_ACTION_WIDTH
    /* 呼び出し側は isOrganizer を外して解決するので host にはならないが、
       型の上では起こりうる。渡されなければ回答の有無だけで組み立てる */
    const self: Exclude<PreEventActionState, { kind: 'host' }> =
      selfState && selfState.kind !== 'host'
        ? selfState
        : state.answered
          ? { kind: 'answered' }
          : { kind: 'open' }

    return (
      <>
        {/*
          **幹事にも回答者用の操作をそのまま出す**（イベント側と同じ形）。
          以前は幹事メニューの中に畳んでいたが、自分が答えるかどうかは
          一般の回答者とまったく同じ判断で、主催の管理操作とは別物。
        */}
        <RespondentAction
          state={self}
          restriction={restriction}
          wide={hostWide}
          size={size}
          onRespond={onRespond}
        />
        <HostMenu
          preEventId={preEventId}
          wide={hostWide}
          size={size}
          promoted={promoted}
          canPromote={canPromote}
          onDelete={onDelete}
        />
      </>
    )
  }

  return (
    <RespondentAction
      state={state}
      restriction={restriction}
      wide={widthClassName ?? 'w-full sm:w-auto sm:min-w-64'}
      size={size}
      onRespond={onRespond}
    />
  )
}

/**
 * 回答者としての操作。**幹事にも同じものを出す**（`selfState` で解決する）。
 *
 * `host` は扱わない。幹事かどうかで回答の可否が変わることは無い。
 */
function RespondentAction({
  state,
  restriction,
  wide,
  size,
  onRespond,
}: {
  state: Exclude<PreEventActionState, { kind: 'host' }>
  restriction?: PlatformRestrictionInput
  wide: string
  size: 'default' | 'sm'
  onRespond?: () => void
}) {
  /* 背の高いボタンでは絵も大きくする。h-12 に size-4 は点にしか見えない */
  const iconSize = size === 'sm' ? 'size-4' : 'size-5'

  switch (state.kind) {
    case 'anonymous':
      return (
        <Button size={size} variant="primary" className={wide} onClick={onRespond}>
          <LogIn className={iconSize} />
          ログインして回答
        </Button>
      )

    case 'open':
      return (
        <Button size={size} variant="primary" className={wide} onClick={onRespond}>
          日程を回答する
        </Button>
      )

    case 'answered':
      return (
        /* 済んでいることを示す。塗りつぶしの primary は未完了の行動のために空ける */
        <Button size={size} variant="state" className={wide} onClick={onRespond}>
          <Check className={iconSize} />
          回答を変更する
        </Button>
      )

    case 'closed':
      return (
        <Button size={size} variant="default" className={wide} disabled>
          <Lock className={iconSize} />
          {state.answered ? '回答済み（受付は終了しました）' : '回答の受付は終了しました'}
        </Button>
      )

    case 'ended':
      return (
        <Button size={size} variant="default" className={wide} disabled>
          {state.answered ? '回答済み（候補日は過ぎました）' : 'この日程調整は終了しました'}
        </Button>
      )

    case 'promoted':
      /*
        **行き先を出す。** 決まった日程調整に来た人が次にすることは、
        イベントのページで参加登録すること（自動で登録された人は確かめること）。
      */
      return state.eventId ? (
        <Button size={size} variant="primary" className={wide} asChild>
          <Link href={`/events/${state.eventId}`}>
            イベントのページへ
            <ArrowRight className={iconSize} data-icon="inline-end" />
          </Link>
        </Button>
      ) : (
        <Button size={size} variant="default" className={wide} disabled>
          イベントになりました
        </Button>
      )

    case 'ineligible':
      return (
        <IneligibleAction
          reason={state.reason}
          restriction={restriction}
          wide={wide}
          size={size}
        />
      )
  }
}

/** 主催の管理操作。**回答者としての操作は入れない**（隣に並べる） */
function HostMenu({
  preEventId,
  wide,
  size,
  promoted,
  canPromote,
  onDelete,
}: {
  preEventId: string
  wide: string
  size: 'default' | 'sm'
  promoted: boolean
  canPromote: boolean
  onDelete?: () => void
}) {
  const iconSize = size === 'sm' ? 'size-4' : 'size-5'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
          色は state。幹事メニューは「押してほしい操作」ではなく、
          自分が主催しているという状態への入口なので、塗りつぶしの
          primary は未完了の行動のために空けておく。
        */}
        <Button size={size} variant="state" className={wide}>
          <Crown className={iconSize} />
          幹事メニュー
          <ChevronDown className="size-4 opacity-70" data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {/* 日程調整の行き着く先。いちばん上に置く */}
        {canPromote ? (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/pre-events/${preEventId}/promote`}>
                <CalendarCheck />
                日程を決めてイベントにする
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        {/* イベントにしたあとは編集できない（サーバーが断る） */}
        {!promoted ? (
          <DropdownMenuItem asChild>
            <Link href={`/pre-events/${preEventId}/edit`}>
              <Pencil />
              日程調整を編集
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem asChild>
          <Link href={`/pre-events/${preEventId}/contact`}>
            <MessageSquare />
            回答者への連絡
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          {/*
            CSV はページ遷移ではなくダウンロード。
            next/link を使うとクライアント遷移を試みるので素の <a> にする。
          */}
          <a href={`/api/v1/pre-events/${preEventId}/export`} download>
            <Download />
            回答をCSV出力
          </a>
        </DropdownMenuItem>
        {/* 取り消せない操作。いちばん下に置き、色でも他と分ける */}
        {onDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              日程調整を削除
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 条件を満たさないときのボタン。押すと理由が開く。
 * **disabled にすると理由を出せない。** イベント側と同じ作り。
 */
function IneligibleAction({
  reason,
  restriction,
  wide,
  size,
}: {
  reason: 'platform' | 'server' | null
  restriction?: PlatformRestrictionInput
  wide: string
  size: 'default' | 'sm'
}) {
  const r = restriction ? resolvePlatformRestriction(restriction) : null
  const iconSize = size === 'sm' ? 'size-4' : 'size-5'

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size={size} variant="default" className={`${wide} text-muted-foreground`}>
          <Lock className={iconSize} />
          回答できる条件を満たしていません
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="mb-2 text-xs font-medium">回答できない理由</p>
        <p className="text-xs text-muted-foreground">
          {reason === 'server'
            ? 'ログイン中のアカウントのサーバーが、主催者の指定したサーバーに含まれていません。'
            : 'ログイン中のアカウントのプラットフォームでは回答できません。'}
        </p>
        {r ? (
          <>
            <p className="mt-3 mb-2 text-xs font-medium">回答できるアカウント</p>
            <AllowedAccountTree r={r} />
          </>
        ) : null}
        {r === null ? (
          <p className="mt-2 text-xs text-muted-foreground">
            {PLATFORM_LABEL.mastodon} などの対応アカウントでログインしてください。
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
