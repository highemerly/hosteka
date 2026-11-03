'use client'

import Link from 'next/link'
import { ChevronLeft, HelpCircle, Laptop, LogOut, Smartphone, Tablet } from 'lucide-react'
import { toast } from 'sonner'

import { useConfirm } from '@/components/common/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ApiClientError } from '@/lib/api/client'
import {
  useAccountSessions,
  useRevokeOtherSessions,
  useRevokeSession,
} from '@/lib/api/queries/account'
import { formatGeo } from '@/lib/geo'
import { formatJstDateTime } from '@/lib/jst'
import { formatLastActive } from '@/lib/last-active'
import { describeUserAgent, deviceKind, type DeviceKind } from '@/lib/user-agent'
import type { AccountSessionDto } from '@/app/api/v1/account/sessions/route'

const PATH = '/account/sessions'

const ICON: Record<DeviceKind, React.ComponentType<{ className?: string }>> = {
  mobile: Smartphone,
  tablet: Tablet,
  desktop: Laptop,
  unknown: HelpCircle,
}

function SessionRow({
  item,
  now,
  onRevoke,
  pending,
}: {
  item: AccountSessionDto
  /** サーバーの時刻。端末の時計とは比べない */
  now: string
  onRevoke: (item: AccountSessionDto) => void
  pending: boolean
}) {
  const Icon = ICON[deviceKind(item.userAgent)]
  const place = formatGeo(item)

  return (
    <div className="flex items-start gap-3 py-4">
      <span className="mt-0.5 text-muted-foreground" aria-hidden>
        <Icon className="size-5" />
      </span>

      {/*
        **狭い画面ではボタンを最後の行へ落とす。** 横に並べると、
        端末の名前と日時がボタンの残りの幅に押し込まれて何行にも折れる。
      */}
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          {/* 1行目は端末だけ。行を見分ける手がかりを他の値に埋もれさせない */}
          <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            {describeUserAgent(item.userAgent)}
            {item.current ? (
              /* 状態のトーン。押せないので立体は付けない */
              <span className="rounded-lg border border-primary/70 bg-primary-surface px-1.5 py-0.5 text-xs font-medium text-primary-surface-foreground">
                この端末
              </span>
            ) : null}
          </p>
          <div className="mt-1 text-sm text-muted-foreground">
            {/*
              日時ではなく「どれくらい前か」で書く。記録は最大1時間に1回しか
              進まないので、分まで出すと持っていない精度を言うことになる
            */}
            <p>{item.current ? '現在アクティブ' : formatLastActive(item.lastUsedAt, now)}</p>
            <p>ログイン日時 {formatJstDateTime(item.createdAt)}</p>
            {/* 場所は CF のヘッダ由来。分からないときは行ごと出さない */}
            {place ? <p>ログイン地域（推定） {place}</p> : null}
            {/* IPv6 は切れ目が無く、狭い画面では枠からはみ出す */}
            {item.ipAddress ? <p className="break-all">IPアドレス {item.ipAddress}</p> : null}
          </div>
        </div>

        {/* いまの端末はここから切らない。終わらせたい人にはログアウトがある */}
        {item.current ? null : (
          <Button
            variant="default"
            size="sm"
            disabled={pending}
            onClick={() => onRevoke(item)}
            className="shrink-0 self-start"
          >
            <LogOut className="size-4" aria-hidden />
            ログアウトさせる
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * ログイン中の端末。
 *
 * **Cookie を消すだけでは終わらない**セッションを、利用者自身が切るための画面。
 * 端末を失くした・共用の PC で入ったまま帰った、が自力で直せるようになる。
 *
 * **一覧に「失効済み」は出さない。** 見えても何もできないうえ、
 * 行が増えるほど身に覚えのない端末を見つけにくくなる。
 */
export default function SessionsScreen() {
  const confirm = useConfirm()
  const { data, isPending, error } = useAccountSessions()
  const revoke = useRevokeSession()
  const revokeOthers = useRevokeOtherSessions()

  const unauthenticated = error instanceof ApiClientError && error.code === 'UNAUTHENTICATED'
  const others = data?.sessions.filter((s) => !s.current) ?? []
  const busy = revoke.isPending || revokeOthers.isPending

  const revokeOne = async (item: AccountSessionDto) => {
    /*
      **どの端末かを名前で言う。** 一覧には何行も並ぶので、「この端末」では
      どれを指すのか分からない（画面の上では「この端末」は自分が
      いま使っている端末の印でもある）。
    */
    const device = describeUserAgent(item.userAgent)
    const ok = await confirm({
      title: `${device} をログアウトさせますか？`,
      confirmLabel: 'ログアウトさせる',
    })
    if (!ok) return

    revoke.mutate(item.id, {
      onSuccess: () => toast.success(`${device} をログアウトさせました`),
      onError: (e) =>
        toast.error(e instanceof ApiClientError ? e.message : 'ログアウトさせられませんでした'),
    })
  }

  const revokeAllOthers = async () => {
    const ok = await confirm({
      title: 'ほかの端末をすべてログアウトさせますか？',
      description: `${others.length}件のログインが終了します。この端末は残ります。`,
      confirmLabel: 'ログアウトさせる',
    })
    if (!ok) return

    revokeOthers.mutate(undefined, {
      onSuccess: (result) => toast.success(`${result.revoked}件をログアウトさせました`),
      onError: () => toast.error('ログアウトさせられませんでした'),
    })
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        マイページ
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          ログイン中の端末
        </h1>
        {others.length > 0 ? (
          <Button variant="default" disabled={busy} onClick={() => void revokeAllOthers()}>
            ほかの端末をログアウト
          </Button>
        ) : null}
      </div>

      {unauthenticated ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">
            ログイン中の端末を見るにはログインが必要です。
          </p>
          <Button variant="primary" className="mt-4" asChild>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(PATH)}`}>ログイン</Link>
          </Button>
        </div>
      ) : error ? (
        <p className="mt-6 rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          読み込めませんでした。時間をおいて開き直してください。
        </p>
      ) : isPending ? (
        <div className="mt-6 space-y-3">
          {Array.from({ length: 2 }, (_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : (
        /*
          空の場合を書き分けていない。この一覧を取れている＝有効な
          セッションが少なくとも1つある、ということなので、0件にはならない。
        */
        <div className="mt-6 rounded-xl border border-border bg-card px-5">
          <div className="rule-y">
            {data.sessions.map((item) => (
              <SessionRow
                key={item.id}
                item={item}
                now={data.now}
                onRevoke={(target) => void revokeOne(target)}
                pending={busy}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
