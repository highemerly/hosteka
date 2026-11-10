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
import { PreEventCard } from '@/components/attendable/PreEventCard'
import { Pagination } from '@/components/common/Pagination'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useHashtagEvents } from '@/lib/api/queries/events'
import { useHashtagSummary } from '@/lib/api/queries/hashtags'
import { useHashtagPreEvents } from '@/lib/api/queries/pre-events'
import { hashtagPath } from '@/lib/hashtags'
import { isHashtagScope, type HashtagScope } from '@/schemas/hashtag'

/**
 * 1ページあたりの件数。
 *
 * カードは 1 / 2 / 3 列に並ぶので、**どの幅でも行が半端に余らないよう
 * 6 の倍数にする。** モバイルで18件出すと縦に長すぎ、PCで6件だと
 * 2行で終わってページ送りばかり押すことになる。
 */
const PER_PAGE_NARROW = 6
const PER_PAGE_WIDE = 12

const SCOPES: { value: HashtagScope; label: string; empty: string }[] = [
  { value: 'upcoming', label: '開催予定', empty: '開催予定のイベント' },
  { value: 'pre-events', label: '日程調整中', empty: '受付中の日程調整' },
  { value: 'past', label: '終了', empty: '終了したイベント' },
]

/**
 * ハッシュタグのページ。イベントと日程調整の両方を出す。
 *
 * 一覧画面と同じカードを使う。同じものが違う姿で出てくると、
 * 「これは別の何かか」と読む側に確かめさせることになる。
 *
 * **イベントと日程調整は切り替えで分ける**（`schemas/hashtag.ts`）。
 * 開いた先は「開催予定」なので、**切り替えの見出しに件数を出す** —
 * 出さないと、日程調整中のものがあっても気づけない。
 *
 * **絞り込みとページはURLに持つ。** 「終了したイベントの2ページ目」を
 * そのまま貼れるし、戻るで元の位置へ帰れる。
 */
export default function HashtagScreen({ tag }: { tag: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const scopeParam = searchParams.get('scope')
  const scope: HashtagScope = isHashtagScope(scopeParam) ? scopeParam : 'upcoming'
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

  const showPreEvents = scope === 'pre-events'
  const summary = useHashtagSummary(tag)
  const events = useHashtagEvents(
    tag,
    showPreEvents ? 'upcoming' : scope,
    page,
    perPage,
    !showPreEvents
  )
  const preEvents = useHashtagPreEvents(tag, page, perPage, showPreEvents)
  const list = showPreEvents ? preEvents : events

  const navigate = (next: { scope?: HashtagScope; page?: number }) => {
    const params = new URLSearchParams()
    const nextScope = next.scope ?? scope
    const nextPage = next.page ?? page
    if (nextScope !== 'upcoming') params.set('scope', nextScope)
    if (nextPage > 1) params.set('page', String(nextPage))
    const query = params.toString()
    router.push(`${hashtagPath(tag)}${query ? `?${query}` : ''}`, { scroll: false })
  }

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    const next = search.trim().replace(/^#/, '')
    if (next && next !== tag) router.push(hashtagPath(next))
  }

  const counts = summary.data?.counts
  const current = SCOPES.find((s) => s.value === scope)!

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

      <SegmentedControl
        className="mt-4"
        aria-label="表示する一覧"
        value={scope}
        onValueChange={(next) => navigate({ scope: next, page: 1 })}
        options={SCOPES.map(({ value, label }) => ({
          value,
          label: (
            <>
              {label}
              {counts ? (
                <span className="ml-1.5 tabular-nums text-muted-foreground">
                  {counts[value]}
                </span>
              ) : null}
            </>
          ),
        }))}
      />

      <div className="mt-5">
        {list.error ? (
          <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            読み込めませんでした。時間をおいて開き直してください。
          </p>
        ) : list.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : list.data.items.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-foreground">
              #{tag} の{current.empty}はありません。
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {showPreEvents
              ? preEvents.data?.items.map((preEvent) => (
                  <PreEventCard key={preEvent.id} preEvent={preEvent} />
                ))
              : events.data?.items.map((event) => <EventCard key={event.id} event={event} />)}
          </div>
        )}
      </div>

      {!list.isPending && !list.error ? (
        <Pagination
          page={page}
          totalPages={list.data.meta.totalPages}
          onPageChange={(next) => navigate({ page: next })}
        />
      ) : null}
    </div>
  )
}
