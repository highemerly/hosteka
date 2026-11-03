'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, Search, X } from 'lucide-react'

import { UserAvatar } from '@/components/event/EventInfoRow'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiClientError } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { findPlatform } from '@/screens/auth/sign-in-platforms'

import { profileUrl } from '@/lib/profile-url'

/**
 * 管理画面の共通部品。
 *
 * **7画面を同じ部品で組む。** 旧管理画面は画面ごとに表・バッジ・
 * ページ送りを書いていて、同じ「無効化済み」が画面によって赤い丸だったり
 * 黄色い丸だったりした。ページ送りも3通りあり、1つは5ページ目以降へ
 * 行けなかった。
 */

// =============================================================================
// 外枠
// =============================================================================

type Gate = 'unauthenticated' | 'forbidden' | null

function gateOf(error: unknown): Gate {
  if (!(error instanceof ApiClientError)) return null
  if (error.code === 'UNAUTHENTICATED') return 'unauthenticated'
  if (error.code === 'FORBIDDEN') return 'forbidden'
  return null
}

/**
 * 管理画面の外枠。戻り先・見出し・右肩の操作と、入れないときの案内。
 *
 * **入れるかどうかは API の応答で決める。** `page.tsx` はセッションを
 * 見ない（CLAUDE.md「レンダリングとキャッシュ」）ので、ここが唯一の入口の判定になる。
 * 管理者かどうかは API が DB で確かめる（`auth: 'admin'`）。
 */
export function AdminFrame({
  back = { href: '/admin', label: '管理画面' },
  title,
  actions,
  error,
  children,
}: {
  /** 戻り先。管理画面のトップでは null */
  back?: { href: string; label: string } | null
  title: React.ReactNode
  actions?: React.ReactNode
  /** 画面の主な取得のエラー。401・403 のときは本文の代わりに案内を出す */
  error?: unknown
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const gate = gateOf(error)

  return (
    <div className={cn('mx-auto w-full max-w-5xl px-4', back ? 'py-6' : 'py-8')}>
      {back ? (
        <Link
          href={back.href}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          {back.label}
        </Link>
      ) : null}

      <div className={cn('flex flex-wrap items-center justify-between gap-3', back && 'mt-4')}>
        <h1 className="min-w-0 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        {gate ? null : actions}
      </div>

      {gate === 'unauthenticated' ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">管理画面を開くにはログインが必要です。</p>
          <Button variant="primary" className="mt-4" asChild>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(pathname ?? '/admin')}`}>
              ログイン
            </Link>
          </Button>
        </div>
      ) : gate === 'forbidden' ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">管理画面は管理者だけが開けます。</p>
          <Button variant="default" className="mt-4" asChild>
            <Link href="/dashboard">マイページへ</Link>
          </Button>
        </div>
      ) : (
        children
      )}
    </div>
  )
}

/** 取得に失敗したとき。入れない（401・403）ときは `AdminFrame` が引き受ける */
export function LoadError() {
  return (
    <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
      読み込めませんでした。時間をおいて開き直してください。
    </p>
  )
}

// =============================================================================
// 一覧
// =============================================================================

/**
 * 検索欄。**Enter か虫眼鏡で確定する**（打つたびに取りに行かない）。
 *
 * 値は URL に持つので、戻る・進むで URL が変わったら欄も追いかける。
 */
export function SearchBox({
  value,
  onSubmit,
  label,
  placeholder,
}: {
  value: string
  onSubmit: (value: string) => void
  /** 読み上げ用。見た目のラベルは置かない（虫眼鏡と例で足りる） */
  label: string
  placeholder: string
}) {
  /*
    URL の値に追従する（戻る・進むで検索語が変わる）。**描画中に合わせる** —
    effect で `setDraft` すると古い語を一度描いてから差し替わる
    （`react-hooks/set-state-in-effect`）。
  */
  const [draft, setDraft] = React.useState(value)
  const [lastValue, setLastValue] = React.useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }

  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit(draft.trim())
      }}
      className="flex w-full items-center gap-2 sm:w-80"
    >
      <div className="relative min-w-0 flex-1">
        <Input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          aria-label={label}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className={cn('h-11', draft && 'pr-10')}
        />
        {/* 確定済みの語を消す。消すと同時に一覧も戻す（もう1回押させない） */}
        {draft ? (
          <button
            type="button"
            aria-label="検索語を消す"
            onClick={() => {
              setDraft('')
              if (value) onSubmit('')
            }}
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
      {/* 高さは隣の SegmentedControl（h-11）に揃える */}
      <Button type="submit" variant="default" size="icon" aria-label="検索" className="size-11">
        <Search className="size-4" />
      </Button>
    </form>
  )
}

/** 絞り込みの列。検索・択一・並び順と、右端に件数 */
export function Toolbar({ total, children }: { total?: number; children: React.ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
      {children}
      {total !== undefined ? (
        <span className="text-sm text-muted-foreground">{total}件</span>
      ) : null}
    </div>
  )
}

/**
 * 行の一覧。読み込み中・失敗・空をここで書き分ける。
 *
 * **行は `.rule-y` で上下の縁と間に線を引く**（DESIGN_GUIDELINES「罫線」）。
 * 表にしない。列が8つある表は狭い画面で横に流すしかなく、
 * 名前と操作が同時に見えなくなる。
 */
export function RowList({
  isPending,
  error,
  empty,
  children,
}: {
  isPending: boolean
  error: unknown
  empty: boolean
  children: React.ReactNode
}) {
  if (error) {
    return (
      <div className="mt-5">
        <LoadError />
      </div>
    )
  }
  if (isPending) {
    return (
      <div className="mt-5 space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    )
  }
  if (empty) {
    return (
      <p className="mt-5 rounded-xl border border-border bg-card p-8 text-center text-sm text-foreground">
        条件に合うものはありません。
      </p>
    )
  }
  return <div className="rule-y mt-5">{children}</div>
}

/**
 * 一覧の1行。左に題名と情報、右に操作。
 *
 * **狭い画面では操作を下へ回す。** 横に並べたままだと題名が数文字しか見えない。
 */
export function Row({
  title,
  badges,
  children,
  action,
}: {
  title: React.ReactNode
  badges?: React.ReactNode
  /** 題名の下の情報。1行ずつ `<p>` で渡す */
  children?: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 font-medium break-words text-foreground">{title}</span>
          {badges}
        </div>
        {children ? (
          <div className="space-y-0.5 text-sm text-muted-foreground">{children}</div>
        ) : null}
      </div>
      {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  )
}

/** 行の題名のリンク。本文の色のまま、触れたときだけ下線 */
export function TitleLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-foreground underline-offset-4 hover:underline">
      {children}
    </Link>
  )
}

/**
 * 状態の札。**押せないので立体を付けない**（DESIGN_GUIDELINES「バッジの立体」）。
 *
 * 強弱は2段だけ使う。
 * - `emphasis` … 対応が要る・普段と違う（未処理・無効化）。線（濃）＋淡い塗り＋太字
 * - `note`     … 必要なら読む（非公開・中止・管理者）。線のみ
 *
 * **「公開中」「有効」のような普段の状態には札を付けない。** 全行に
 * 同じ札が並ぶと、違う行を探す邪魔になる。
 */
export function StatusBadge({
  tone = 'note',
  children,
}: {
  tone?: 'emphasis' | 'note'
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-lg border px-2 py-0.5 text-xs whitespace-nowrap',
        tone === 'emphasis'
          ? 'border-primary bg-primary/10 font-semibold text-primary'
          : 'border-border text-muted-foreground'
      )}
    >
      {children}
    </span>
  )
}

/**
 * 人の1行。アバター・表示名・プラットフォーム・`@名前@サーバー`。
 * 名前の側は SNS のプロフィールを別タブで開く（開ける場合）。
 */
export function UserLine({
  user,
  size = 'sm',
}: {
  user: {
    displayName: string
    username: string
    server: string
    platform: string
    avatar?: string | null
  }
  size?: 'md' | 'sm' | 'xs'
}) {
  const platform = findPlatform(user.platform)
  const href = profileUrl(user)
  const handle = `@${user.username}@${user.server}`

  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <UserAvatar name={user.displayName} src={user.avatar ?? null} size={size} />
      <span className="min-w-0">
        <span className="flex min-w-0 items-center gap-1.5 text-foreground">
          <span className="truncate">{user.displayName}</span>
          {platform ? (
            <platform.icon className="size-3.5 shrink-0 text-muted-foreground" aria-label={platform.label} />
          ) : null}
        </span>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {handle}
          </a>
        ) : (
          <span className="block truncate text-xs text-muted-foreground">{handle}</span>
        )}
      </span>
    </span>
  )
}

/**
 * 「このユーザーが主催したものだけ」の印。✕ で外す。
 *
 * ユーザー一覧の件数から飛んできたときに付く。**印を出さないと、
 * 一覧が絞られていることに気づけない**（件数が少ないだけに見える）。
 */
export function CreatorFilterChip({
  name,
  onClear,
}: {
  /** 分かれば主催者の名前。一覧が空だと分からない */
  name: string | null
  onClear: () => void
}) {
  return (
    <span className="inline-flex h-9 items-center gap-1 rounded-lg border border-primary bg-primary/10 pr-1 pl-3 text-sm font-medium text-primary">
      {name ? `${name} の主催` : '指定したユーザーの主催'}
      <button
        type="button"
        onClick={onClear}
        aria-label="主催者の絞り込みを外す"
        className="grid size-7 place-items-center rounded-lg transition-colors hover:bg-primary/15"
      >
        <X className="size-4" />
      </button>
    </span>
  )
}
