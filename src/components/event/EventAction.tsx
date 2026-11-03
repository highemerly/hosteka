'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  ChevronDown,
  ClipboardList,
  Crown,
  Download,
  CircleSlash,
  LogIn,
  Lock,
  MessageSquare,
  Pencil,
  Users,
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
import {
  resolvePlatformRestriction,
  type PlatformRestrictionInput,
} from './allowed-platforms'
import { HOST_ACTION_WIDTH } from '@/components/attendable/DetailParts'
import { AllowedAccountTree } from './PlatformCondition'

/**
 * 参加操作の状態。
 *
 * この画面で最も分岐が多い箇所。ラベルだけでなく「押せるか」「何が起きるか」
 * が変わるため、配置を決める前に列挙しておく必要がある。
 */
export type EventActionState =
  /** 未ログイン */
  | { kind: 'anonymous' }
  /** 幹事。参加登録もここから行う */
  | { kind: 'host' }
  /** 未登録・受付中・空きあり */
  | { kind: 'open' }
  /** 未登録・満員だが参加リクエストは受け付ける */
  | { kind: 'requestable' }
  /** 未登録・満員でリクエストも不可 */
  | { kind: 'full' }
  /** 未登録・締切後 */
  | { kind: 'closed' }
  /** 未登録・プラットフォームやサーバーの条件を満たさない */
  | { kind: 'ineligible'; reason: 'platform' | 'server' | null }
  /** イベントが中止された */
  | { kind: 'cancelled' }
  /** イベントが終了した */
  | { kind: 'ended' }
  /**
   * 回答済み。**欠席も回答である。**
   * 「参加していない」と「まだ答えていない」を同じ姿にすると、
   * 欠席と答えた人に再び参加登録を促すことになる。
   */
  | {
      kind: 'registered'
      status: 'attending' | 'maybe' | 'participation_request' | 'not_attending'
    }

/**
 * 回答済みのボタンに出す文言。
 *
 * **開くモーダルの選択肢と同じ言葉を使う**（`ParticipateDialog` の
 * `CHOICE_LABEL`）。「参加登録済み」「未定で回答済み」と言い換えていたが、
 * 押した先に並ぶのは「参加」「未定」「欠席」で、選んだものと表示が
 * 一致しなかった。
 *
 * **「回答：」を頭に置く。** 語尾で状態を言うと（「〜で回答済み」）
 * 肝心の選んだ答えが真ん中に埋まるうえ、狭い画面で折り返したときに
 * 1行目が「未定で」になる。
 */
const REGISTERED_LABEL = {
  attending: '回答：参加',
  maybe: '回答：未定',
  participation_request: '回答：参加リクエスト',
  not_attending: '回答：欠席',
} as const

/**
 * 参加操作。
 *
 * **幹事には、参加者用の操作と幹事メニューを横に並べる。** 以前は
 * 幹事メニューの中に「自身の参加登録」を畳んでいたが、自分が参加するか
 * どうかは一般の参加者とまったく同じ判断で、主催の管理操作とは別物。
 * 畳むと、参加登録したつもりの幹事が登録できていないことに気づけない。
 */
export function EventAction({
  eventId,
  cancelled = false,
  canCancel = false,
  restriction,
  state,
  selfState,
  widthClassName,
  size = 'default',
  onParticipate,
  onEditParticipation,
}: {
  /** 幹事メニューの各項目のリンク先を組み立てるのに使う */
  eventId: string
  /**
   * 中止済みか。
   *
   * **中止したイベントは編集できない**（`events/[id]` の PUT と
   * 参加者の操作 `participants/[userId]` がサーバー側で拒む）。項目を出したままにすると、
   * 開いて書いたあとに弾かれる。連絡・出欠・CSV は中止後も続けられる。
   */
  cancelled?: boolean
  /**
   * 中止できるか。**幹事とグループのスタッフは編集できても中止はできない**
   * （サーバーが拒む。`requireEventOwner`）ので、項目ごと出さない。
   */
  canCancel?: boolean
  /** 参加できない理由を具体的に書くのに使う */
  restriction?: PlatformRestrictionInput
  state: EventActionState
  /**
   * 幹事自身の参加状態。
   *
   * 幹事の隣に並べる参加ボタンにも、一般の参加者と同じ判定が要る。
   * 主催者だからといって締切後や満員のときに登録できるわけではないし、
   * 既に参加していれば「登録」ではなく「変更」でなければならない。
   * state だけ見ていると host に潰れて判定が消える。
   */
  selfState?: EventActionState
  /**
   * ボタンの横幅。
   *
   * 既定は本文の頭に単独で置く姿（広く取る）。**説明の下の操作列では
   * 他のボタンと肩を並べる**ので、そこだけ狭い指定を渡す。
   * ここを呼び出し側から渡せるようにしておかないと、同じ操作を2箇所に
   * 置いた途端、片方が列の中で1つだけ長くなる。
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
  onParticipate?: () => void
  onEditParticipation?: () => void
}) {
  if (state.kind === 'host') {
    /*
      2つ並ぶので、単独で置くときより狭い既定にする。
      **どちらも同じ幅にする** — 幅が違うと、片方が主で片方が従に見える。
    */
    const hostWide = widthClassName ?? HOST_ACTION_WIDTH
    /* 呼び出し側は isOrganizer を外して解決するので host にはならないが、
       型の上では起こりうる。二重に幹事メニューを出さないよう落とす */
    const self = selfState && selfState.kind !== 'host' ? selfState : null

    return (
      <>
        {/*
          中止後は出さない。selfState は必ず「このイベントは中止されました」に
          なり、すぐ上の中止の知らせと同じことを二度言うことになる。
        */}
        {self && !cancelled ? (
          <ParticipantAction
            state={self}
            restriction={restriction}
            wide={hostWide}
            size={size}
            onParticipate={onParticipate}
            onEditParticipation={onEditParticipation}
          />
        ) : null}

        <HostMenu
          eventId={eventId}
          cancelled={cancelled}
          canCancel={canCancel}
          wide={hostWide}
          size={size}
        />
      </>
    )
  }

  return (
    <ParticipantAction
      state={state}
      restriction={restriction}
      wide={widthClassName ?? 'w-full sm:w-auto sm:min-w-64'}
      size={size}
      onParticipate={onParticipate}
      onEditParticipation={onEditParticipation}
    />
  )
}

/**
 * 参加者としての操作。**幹事にも同じものを出す**（`selfState` で解決する）。
 *
 * `host` は扱わない。幹事かどうかで参加の可否が変わることは無いので、
 * ここに主催の都合を持ち込まない。
 */
function ParticipantAction({
  state,
  restriction,
  wide,
  size,
  onParticipate,
  onEditParticipation,
}: {
  state: Exclude<EventActionState, { kind: 'host' }>
  restriction?: PlatformRestrictionInput
  wide: string
  size: 'default' | 'sm'
  onParticipate?: () => void
  onEditParticipation?: () => void
}) {
  /* 背の高いボタンでは絵も大きくする。h-12 に size-4 は点にしか見えない */
  const iconSize = size === 'sm' ? 'size-4' : 'size-5'

  switch (state.kind) {
    case 'anonymous':
      return (
        <Button size={size} variant="primary" className={wide} onClick={onParticipate}>
          <LogIn className={iconSize} />
          ログインして参加登録
        </Button>
      )

    case 'open':
      return (
        <Button size={size} variant="primary" className={wide} onClick={onParticipate}>
          参加登録
        </Button>
      )

    case 'requestable':
      return (
        <Button size={size} variant="primary" className={wide} onClick={onParticipate}>
          参加をリクエスト
        </Button>
      )

    /*
      押せない状態でもボタンを消さない。消すと「操作が無い」のか
      「見落としている」のか分からない。理由をラベルに出す。
    */
    case 'full':
      return (
        <Button size={size} variant="default" className={wide} disabled>
          <Lock className={iconSize} />
          満員のため受付を終了しました
        </Button>
      )

    case 'closed':
      return (
        <Button size={size} variant="default" className={wide} disabled>
          <Lock className={iconSize} />
          回答締切を過ぎました
        </Button>
      )

    /*
      締切と混ぜない。締切は待てば分かるが、こちらは何をしても
      参加できない。理由が違うものを同じ文言にすると、
      参加できない人が締切を待ち続けることになる。

      **押せる状態のまま残す。** disabled にすると理由を出せない。
      別アカウントで入り直せば済むのか、そもそも無理なのかは
      開かないと分からない。
    */
    case 'ineligible':
      return (
        <IneligibleAction
          reason={state.reason}
          restriction={restriction}
          wide={wide}
          size={size}
        />
      )

    case 'cancelled':
      return (
        <Button size={size} variant="default" className={wide} disabled>
          このイベントは中止されました
        </Button>
      )

    case 'ended':
      return (
        <Button size={size} variant="default" className={wide} disabled>
          このイベントは終了しました
        </Button>
      )

    case 'registered':
      /*
        **押すと変更モーダルが開く。プルダウンを挟まない。**
        キャンセルは変更モーダルの回答選択肢に統合したので、
        ここから枝分かれする行き先はもう1つしかない。
      */
      return (
        <Button
          size={size}
          /*
            登録済みは「済んだこと」なので primary にしない。
            かといって中立色だと、押せない状態や副次ボタンと区別がつかない。
            state（primary と同じ青のトーナル）で「もう済んでいる」ことを示す。

            欠席は「済んでいる」が「参加している」ではない。
            青く塗ると参加しているように読める。
          */
          variant={state.status === 'not_attending' ? 'default' : 'state'}
          className={wide}
          onClick={onEditParticipation}
        >
          {/*
            **頭の記号は置かない。** ✓ と ✕ で参加と欠席を描き分けていたが、
            すぐ隣に「参加」「欠席」と書いてあるので同じことを二度言っている。
            狭い画面では、その2文字ぶんが折り返しの分かれ目になる。
          */}
          {REGISTERED_LABEL[state.status]}
          {/* 押すと何ができるのかを絵で示す。矢印にするとメニューが開くと読める */}
          <Pencil className="size-4 opacity-70" data-icon="inline-end" />
        </Button>
      )
  }
}

/** 主催の管理操作。**参加者としての操作は入れない**（隣に並べる） */
function HostMenu({
  eventId,
  cancelled,
  canCancel,
  wide,
  size,
}: {
  eventId: string
  cancelled: boolean
  canCancel: boolean
  wide: string
  size: 'default' | 'sm'
}) {
  const iconSize = size === 'sm' ? 'size-4' : 'size-5'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/*
          幹事メニューは「押してほしい操作」ではなく、自分が主催している
          という状態への入口なので state にする。塗りつぶしの primary は
          未完了の行動のために空けておく。
          参加登録との違いは王冠で示す。参加者一覧で「主催者」を意味する
          記号を使い回すことで、語彙が一貫する。
        */}
        <Button size={size} variant="state" className={wide}>
          <Crown className={iconSize} />
          幹事メニュー
          <ChevronDown className="size-4 opacity-70" data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {/* 中止したイベントは編集できない（サーバーが拒む）ので出さない */}
        {!cancelled ? (
          <>
            <DropdownMenuItem asChild>
              <Link href={`/events/${eventId}/edit`}>
                <Pencil />
                イベントを編集
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/events/${eventId}/edit-participants`}>
                <Users />
                参加者を編集
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
        <DropdownMenuItem asChild>
          {/* 当日の出欠・集金記録。幹事メモもここで書く */}
          <Link href={`/events/${eventId}/register`}>
            <ClipboardList />
            出欠登録
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* 参加者へ声をかける。日程調整の幹事メニューと同じ位置に置く */}
        <DropdownMenuItem asChild>
          <Link href={`/events/${eventId}/contact`}>
            <MessageSquare />
            参加者への連絡
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          {/*
            CSV はページ遷移ではなくダウンロード。
            next/link を使うとクライアント遷移を試みるので素の <a> にする。
          */}
          <a href={`/api/v1/events/${eventId}/export`} download>
            <Download />
            参加者をCSV出力
          </a>
        </DropdownMenuItem>
        {/*
          中止は取り消せないので、押した先で何が変わるかを読ませる
          （`/events/[id]/cancel`）。ここでは実行しない。
          **削除は用意しない** — 参加者の記録ごと消えるため。
        */}
        {!cancelled && canCancel ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" asChild>
              <Link href={`/events/${eventId}/cancel`}>
                <CircleSlash />
                イベントを中止
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * 参加条件を満たさないときのボタン。押すと理由が開く。
 *
 * ボタンの見た目は他の「押せない状態」と揃えるが、実際には押せる。
 * 押した先に理由があることは下向き矢印で示す（参加条件バッジと同じ語彙）。
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
          参加条件を満たしていません
          <ChevronDown className="size-4 opacity-70" data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="mb-2 text-xs font-medium">参加できない理由</p>
        <p className="text-xs text-muted-foreground">
          {reason === 'server'
            ? 'ログイン中のアカウントのサーバーが、主催者の指定したサーバーに含まれていません。'
            : 'ログイン中のアカウントのプラットフォームでは参加登録できません。'}
        </p>

        {r ? (
          <>
            <p className="mt-3 mb-2 text-xs font-medium">参加できるアカウント</p>
            <AllowedAccountTree r={r} />
          </>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
