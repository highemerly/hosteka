'use client'

import * as React from 'react'
import Link from 'next/link'
import { CalendarPlus, Server, Sparkles, Timer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HashtagSearchForm } from '@/components/common/HashtagSearchForm'
import { PreEventCard } from '@/components/attendable/PreEventCard'
import { usePreEventSections } from '@/lib/api/queries/pre-events'
import type { PreEventListItemDto } from '@/server/serializers/pre-event'

function Section({
  icon,
  title,
  description,
  items,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  items: PreEventListItemDto[]
}) {
  // 空のセクションは見出しごと出さない。「該当なし」を並べても
  // 読む側にできることは増えない
  if (items.length === 0) return null

  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((preEvent) => (
          <PreEventCard key={preEvent.id} preEvent={preEvent} />
        ))}
      </div>
    </section>
  )
}

/**
 * 日程調整の一覧。
 *
 * イベント一覧と同じ作り（`/api/v1/pre-events/sections` から1リクエスト、
 * カードは `AttendableCard` を共有）。**利用者に絞り込みを選ばせない。**
 * まだ回答していないものだけを出す。
 */
export default function PreEventsListScreen() {
  const { data, isPending, error } = usePreEventSections()

  const isEmpty =
    data != null &&
    data.deadlineSoon.length === 0 &&
    data.latest.length === 0 &&
    (data.myServer?.items.length ?? 0) === 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          日程調整を探す
        </h1>
        <Button variant="primary" asChild>
          <Link href="/pre-events/create">
            <CalendarPlus className="size-4" />
            日程調整を作成
          </Link>
        </Button>
      </div>

      <div className="mt-5">
        <HashtagSearchForm scope="pre-events" />
      </div>

      <div className="mt-6">
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
        ) : isEmpty ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-foreground">表示できる日程調整がありません。</p>
            <p className="mt-1 text-xs text-muted-foreground">
              まだ回答していない日程調整が今はありません。
            </p>
            <Button variant="primary" className="mt-4" asChild>
              <Link href="/pre-events/create">
                <CalendarPlus className="size-4" />
                日程調整を作成
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {/* 締切が近いものを最初に。見逃すと回答できなくなる */}
            <Section
              icon={<Timer className="size-4" />}
              title="まもなく締切"
              description="7日以内"
              items={data.deadlineSoon}
            />
            {data.myServer ? (
              <Section
                icon={<Server className="size-4" />}
                title={`${data.myServer.server} の日程調整`}
                items={data.myServer.items}
              />
            ) : null}
            <Section icon={<Sparkles className="size-4" />} title="新着" items={data.latest} />
          </>
        )}
      </div>
    </div>
  )
}
