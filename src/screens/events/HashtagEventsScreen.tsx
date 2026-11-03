'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, Hash, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import { EventCard } from '@/components/event/EventCard'
import { Pagination } from '@/components/common/Pagination'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useHashtagEvents, type HashtagScope } from '@/lib/api/queries/events'

/**
 * 1ページあたりの件数。
 *
 * カードは 1 / 2 / 3 列に並ぶので、**どの幅でも行が半端に余らないよう
 * 6 の倍数にする。** モバイルで18件出すと縦に長すぎ、PCで6件だと
 * 2行で終わってページ送りばかり押すことになる。
 */
const PER_PAGE_NARROW = 6
const PER_PAGE_WIDE = 12

const SCOPES: { value: HashtagScope; label: string }[] = [
  { value: 'upcoming', label: '開催予定' },
  { value: 'past', label: '終了' },
]

function isScope(value: string | null): value is HashtagScope {
  return value === 'upcoming' || value === 'past'
}

/**
 * ハッシュタグ別のイベント一覧。
 *
 * 一覧画面と同じカードを使う。同じものが違う姿で出てくると、
 * 「これは別の何かか」と読む側に確かめさせることになる。
 *
 * **絞り込みとページはURLに持つ。** 「終了したイベントの2ページ目」を
 * そのまま貼れるし、戻るで元の位置へ帰れる。
 */
export default function HashtagEventsScreen({ tag }: { tag: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const scopeParam = searchParams.get('scope')
  const scope: HashtagScope = isScope(scopeParam) ? scopeParam : 'upcoming'
  const page = Math.max(Number(searchParams.get('page')) || 1, 1)

  const isWide = useMediaQuery('(min-width: 640px)')
  const perPage = isWide ? PER_PAGE_WIDE : PER_PAGE_NARROW

  /*
    検索欄は今のタグを入れておく。多くの場合は打ち直しではなく手直し。
    タグが変わったら追従するが、**描画中に合わせる**（effect だと
    前のタグを一度描いてから差し替わる）。
  */
  const [search, setSearch] = React.useState(tag)
  const [lastTag, setLastTag] = React.useState(tag)
  if (tag !== lastTag) {
    setLastTag(tag)
    setSearch(tag)
  }

  const { data, isPending, error } = useHashtagEvents(tag, scope, page, perPage)

  const navigate = (next: { scope?: HashtagScope; page?: number }) => {
    const params = new URLSearchParams()
    const nextScope = next.scope ?? scope
    const nextPage = next.page ?? page
    if (nextScope !== 'upcoming') params.set('scope', nextScope)
    if (nextPage > 1) params.set('page', String(nextPage))
    const query = params.toString()
    router.push(`/events/hashtag/${encodeURIComponent(tag)}${query ? `?${query}` : ''}`, {
      scroll: false,
    })
  }

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const next = search.trim().replace(/^#/, '')
    if (next && next !== tag) router.push(`/events/hashtag/${encodeURIComponent(next)}`)
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      {/* 現在地と戻り先。ボタンにすると、この画面の主役の操作に見える */}
      <Link
        href="/events"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        イベントを探す
      </Link>

      <form onSubmit={submitSearch} className="mt-4 flex items-center gap-2 sm:max-w-md">
        <div className="relative min-w-0 flex-1">
          <Hash className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="ハッシュタグで探す"
            className="h-12 pl-9 text-base font-semibold"
          />
        </div>
        <Button type="submit" variant="default" size="icon" aria-label="このタグで探す">
          <Search className="size-4" />
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <SegmentedControl
          aria-label="表示するイベント"
          value={scope}
          onValueChange={(next) => navigate({ scope: next, page: 1 })}
          options={SCOPES}
        />
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
              #{tag} の{scope === 'past' ? '終了した' : '開催予定の'}イベントはありません。
            </p>
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
    </div>
  )
}
