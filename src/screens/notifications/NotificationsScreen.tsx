'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { NotificationRow } from '@/components/notification/NotificationRow'
import { Pagination } from '@/components/common/Pagination'
import { ApiClientError } from '@/lib/api/client'
import {
  useMarkNotificationsSeen,
  useNotifications,
  useRefreshNotifications,
} from '@/lib/api/queries/notifications'
import type { NotificationKind } from '@/schemas/notification'

import {
  buildNotificationsQuery,
  CATEGORIES,
  kindOptions,
  readNotificationsFilters,
  type NotificationsFilters,
} from './notifications-params'

const PATH = '/dashboard/notifications'

/** 1ページの件数。行が縦に並ぶだけなので画面幅で変えない */
const PER_PAGE = 24

/**
 * 通知の一覧。
 *
 * **絞り込みとページはURLに持つ。** 「主催しているものの参加リクエストだけ」を
 * そのまま貼れるし、通知から辿った先から戻ったときに同じ場所へ帰れる。
 */
export default function NotificationsScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const filters = readNotificationsFilters(new URLSearchParams(searchParams.toString()))
  const { category, kind, page } = filters

  const { data, isPending, error } = useNotifications({
    category,
    kind: kind === 'all' ? undefined : kind,
    page,
    perPage: PER_PAGE,
  })

  const markSeen = useMarkNotificationsSeen()
  const refresh = useRefreshNotifications()

  /*
    **開いた時点で既読にする。** 既読位置を動かすのはここと、ベルを開いたときの
    2つだけ（画面遷移のたびに動かすと、連続編集がまとまらなくなる）。

    取り直しは**この画面を離れるとき**にする。いま読んでいる行の強調が
    目の前で消えると、何が新しかったのかが分からなくなる。
  */
  const mark = markSeen.mutate
  React.useEffect(() => {
    mark()
    return () => {
      void refresh()
    }
    // 開いたときに1度だけ。絞り込みを変えるたびに動かすものではない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const navigate = (next: Partial<NotificationsFilters>) => {
    router.push(`${PATH}${buildNotificationsQuery(filters, next)}`, { scroll: false })
  }

  const unauthenticated = error instanceof ApiClientError && error.code === 'UNAUTHENTICATED'
  const kinds = kindOptions(category)

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        マイページ
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">通知</h1>

      {unauthenticated ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">通知を見るにはログインが必要です。</p>
          <Button variant="primary" className="mt-4" asChild>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(PATH)}`}>ログイン</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
            <SegmentedControl
              aria-label="通知の種類"
              value={category}
              onValueChange={(next) => navigate({ category: next })}
              options={CATEGORIES}
            />

            {/* 細かい軸は、粗い軸を選んでいるときだけ。
                「すべて」に対する細かい絞り込みは選択肢が多すぎて選べない */}
            {kinds.length > 0 ? (
              <Select
                value={kind}
                onValueChange={(v) => navigate({ kind: v as NotificationKind | 'all' })}
              >
                {/* 高さは SegmentedControl に揃える（MyEventsScreen と同じ） */}
                <SelectTrigger aria-label="通知を絞り込む" className="h-11 w-44 px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kinds.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {data ? (
              <span className="text-sm text-muted-foreground">{data.meta.total}件</span>
            ) : null}
          </div>

          <div className="mt-5">
            {error ? (
              <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                通知を読み込めませんでした。時間をおいて開き直してください。
              </p>
            ) : isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : data.items.length === 0 ? (
              <p className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                通知はありません。
              </p>
            ) : (
              /* 読ませる面なのでカードにしない。罫線で区切る */
              <ul className="rule-y -mx-3">
                {data.items.map((notification) => (
                  <li key={notification.id}>
                    <NotificationRow notification={notification} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!isPending && !error ? (
            <Pagination
              page={page}
              totalPages={data.meta.totalPages}
              onPageChange={(next) => navigate({ page: next })}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
