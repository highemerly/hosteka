'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarPlus, ChevronLeft } from 'lucide-react'

import { Pagination } from '@/components/common/Pagination'
import { PreEventCard } from '@/components/attendable/PreEventCard'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { ApiClientError } from '@/lib/api/client'
import { useMyPreEvents } from '@/lib/api/queries/pre-events'

import {
  buildMyPreEventsQuery,
  readMyPreEventsFilters,
  ROLES,
  SCOPES,
  type MyPreEventsFilters,
} from './my-pre-events-params'

const PATH = '/dashboard/my-pre-events'

/** カードは 1 / 2 / 3 列に並ぶので6の倍数（イベント側と同じ理由） */
const PER_PAGE_NARROW = 6
const PER_PAGE_WIDE = 12

/**
 * あなたの日程調整一覧。
 *
 * **イベント側（`MyEventsScreen`）と同じ作りにしてある。** 絞り込みの語彙も
 * カードも共有していて、違うのは「回答で絞る」「中止を含める」が
 * 無いことだけ（日程調整に中止は無く、回答は○△×で1件に複数付く）。
 *
 * 旧画面は `/api/v1/pre-events` の汎用の絞り込みを叩き、並び順と
 * 表示モード（詳細／コンパクト）を持っていた。**どちらも移していない** —
 * イベント側と揃えて、必要になったら両方に足す。
 */
export default function MyPreEventsScreen() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const filters = readMyPreEventsFilters(new URLSearchParams(searchParams.toString()))
  const { role, scope, page } = filters

  const isWide = useMediaQuery('(min-width: 640px)')
  const perPage = isWide ? PER_PAGE_WIDE : PER_PAGE_NARROW

  const { data, isPending, error } = useMyPreEvents({ role, scope, page, perPage })

  const navigate = (next: Partial<MyPreEventsFilters>) => {
    router.push(`${PATH}${buildMyPreEventsQuery(filters, next)}`, { scroll: false })
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
        あなたの日程調整
      </h1>

      {unauthenticated ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">
            あなたの日程調整を見るにはログインが必要です。
          </p>
          <Button variant="primary" className="mt-4" asChild>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(PATH)}`}>ログイン</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
            {/* イベント側と同じ理由で、この2つは折り返さない */}
            <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:gap-4">
              <SegmentedControl
                aria-label="主催か回答か"
                value={role}
                onValueChange={(next) => navigate({ role: next })}
                options={ROLES}
                className="min-w-0 grow sm:grow-0"
              />
              <SegmentedControl
                aria-label="表示する日程調整"
                value={scope}
                onValueChange={(next) => navigate({ scope: next })}
                options={SCOPES}
                className="min-w-0 grow sm:grow-0"
              />
            </div>

            {data ? (
              <span className="text-sm text-muted-foreground">{data.meta.total}件</span>
            ) : null}
          </div>

          <div className="mt-5">
            {error ? (
              <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                日程調整を読み込めませんでした。時間をおいて開き直してください。
              </p>
            ) : isPending ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-40 rounded-xl" />
                ))}
              </div>
            ) : data.items.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <p className="text-sm text-foreground">条件に合う日程調整はありません。</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  絞り込みを変えるか、新しい日程調整を作成してください。
                </p>
                <Button variant="primary" className="mt-4" asChild>
                  <Link href="/pre-events/create">
                    <CalendarPlus className="size-4" />
                    日程調整を作成
                  </Link>
                </Button>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.items.map((preEvent) => (
                  <PreEventCard key={preEvent.id} preEvent={preEvent} />
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
