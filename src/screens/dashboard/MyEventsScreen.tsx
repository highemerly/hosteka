'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarPlus, ChevronLeft } from 'lucide-react'

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
import { EventCard } from '@/components/event/EventCard'
import { Pagination } from '@/components/common/Pagination'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { ApiClientError } from '@/lib/api/client'
import { useMyEvents } from '@/lib/api/queries/events'
import type { MyEventsStatus } from '@/schemas/event'

import {
  buildMyEventsQuery,
  readMyEventsFilters,
  ROLES,
  SCOPES,
  STATUSES,
  type MyEventsFilters,
} from './my-events-params'

const PATH = '/dashboard/my-events'

/**
 * 1ページの件数。カードは 1 / 2 / 3 列に並ぶので 6 の倍数にする
 * （HashtagEventsScreen と同じ理由）。
 */
const PER_PAGE_NARROW = 6
const PER_PAGE_WIDE = 12

/**
 * あなたのイベント一覧。
 *
 * **絞り込みとページはURLに持つ。** 「終了した主催イベントの2ページ目」を
 * そのまま貼れるし、詳細から戻ったときに同じ場所へ帰れる。
 *
 * 一覧画面と同じ `EventCard` を使う。同じイベントが場所によって
 * 違う姿で出ると、読む側に「これは別の何かか」と確かめさせることになる。
 */
export default function MyEventsScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const filters = readMyEventsFilters(new URLSearchParams(searchParams.toString()))
  const { role, scope, status, page } = filters

  const isWide = useMediaQuery('(min-width: 640px)')
  const perPage = isWide ? PER_PAGE_WIDE : PER_PAGE_NARROW

  const { data, isPending, error } = useMyEvents({ role, scope, status, page, perPage })

  const navigate = (next: Partial<MyEventsFilters>) => {
    router.push(`${PATH}${buildMyEventsQuery(filters, next)}`, { scroll: false })
  }

  const unauthenticated = error instanceof ApiClientError && error.code === 'UNAUTHENTICATED'

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        マイページ
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        あなたのイベント
      </h1>

      {unauthenticated ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">
            あなたのイベントを見るにはログインが必要です。
          </p>
          <Button variant="primary" className="mt-4" asChild>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(PATH)}`}>
              ログイン
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
            {/* この2つは折り返さない。縦に積むと、幅の狭い端末でだけ
                絞り込みが2行に割れて、下の行が別の何かに見える */}
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:gap-4">
              <SegmentedControl
                aria-label="主催か参加か"
                value={role}
                onValueChange={(next) => navigate({ role: next })}
                options={ROLES}
                className="min-w-0 grow sm:grow-0"
              />
              <SegmentedControl
                aria-label="表示するイベント"
                value={scope}
                onValueChange={(next) => navigate({ scope: next })}
                options={SCOPES}
                className="min-w-0 grow sm:grow-0"
              />
            </div>

            {/* 回答での絞り込みは「参加」を見ているときだけ。
                主催しているイベントは自分の回答と関係なく自分のもの */}
            {role === 'participating' ? (
              <Select value={status} onValueChange={(v) => navigate({ status: v as MyEventsStatus })}>
                {/* 高さは SegmentedControl に揃える。既定の h-8 では
                    隣に並べたときに沈んで見えるうえ、指の的として小さい */}
                <SelectTrigger aria-label="自分の回答で絞り込む" className="h-11 w-44 px-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
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
                イベントを読み込めませんでした。時間をおいて開き直してください。
              </p>
            ) : isPending ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </div>
            ) : data.items.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <p className="text-sm text-foreground">
                  条件に合うイベントはありません。
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  絞り込みを変えるか、新しいイベントを作成してください。
                </p>
                <Button variant="primary" className="mt-4" asChild>
                  <Link href="/events/create">
                    <CalendarPlus className="size-4" />
                    イベントを作成
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.items.map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
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
