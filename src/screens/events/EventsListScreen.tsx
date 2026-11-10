'use client'

import * as React from 'react'
import Link from 'next/link'
import { CalendarPlus, Flame, Server, Sparkles, Timer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { HashtagSearchForm } from '@/components/common/HashtagSearchForm'
import { EventCard } from '@/components/event/EventCard'
import { useEventSections } from '@/lib/api/queries/events'
import type { EventListItemDto } from '@/server/serializers/event'

function SectionSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }, (_, i) => (
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  )
}

/**
 * 見出し付きのカード群。
 *
 * **空のセクションは見出しごと出さない。** 「該当なし」を4つ並べても、
 * 読む側にできることは何も増えない。すべて空のときだけ画面全体で
 * ひとつの案内を出す（呼び出し側）。
 */
function Section({
  icon,
  title,
  description,
  items,
}: {
  icon: React.ReactNode
  title: string
  description?: string
  items: EventListItemDto[]
}) {
  if (items.length === 0) return null

  return (
    <section className="mt-8 first:mt-0">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </section>
  )
}

/**
 * イベント一覧。
 *
 * セクションは `/api/v1/events/sections` から**1リクエストで**取る。
 * 旧一覧はセクションごとに逐次で叩いており、モバイルでは往復が
 * そのまま待ち時間になっていた。
 */
export default function EventsListScreen() {
  const { data, isPending, error } = useEventSections()

  const isEmpty =
    data != null &&
    data.featured.length === 0 &&
    data.deadlineSoon.length === 0 &&
    data.latest.length === 0 &&
    (data.myServer?.items.length ?? 0) === 0

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          イベントを探す
        </h1>
        <Button variant="primary" asChild>
          <Link href="/events/create">
            <CalendarPlus className="size-4" />
            イベントを作成
          </Link>
        </Button>
      </div>

      <div className="mt-5">
        <HashtagSearchForm />
      </div>

      <div className="mt-6">
        {error ? (
          <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            イベントを読み込めませんでした。時間をおいて開き直してください。
          </p>
        ) : isPending ? (
          <SectionSkeleton />
        ) : isEmpty ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="text-sm text-foreground">表示できるイベントがありません。</p>
            {/* この一覧は参加登録済みを出さない。空＝全部登録済みか、本当に無い */}
            <p className="mt-1 text-xs text-muted-foreground">
              参加登録していないイベントが今はありません。
            </p>
            <Button variant="primary" className="mt-4" asChild>
              <Link href="/events/create">
                <CalendarPlus className="size-4" />
                イベントを作成
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {/* 締切が近いものを最初に出す。見逃すと取り返しがつかない */}
            <Section
              icon={<Timer className="size-4" />}
              title="まもなく締切"
              description="7日以内"
              items={data.deadlineSoon}
            />
            {data.myServer ? (
              <Section
                icon={<Server className="size-4" />}
                title={`${data.myServer.server} のイベント`}
                items={data.myServer.items}
              />
            ) : null}
            <Section
              icon={<Flame className="size-4" />}
              title="人が集まっている"
              items={data.featured}
            />
            <Section
              icon={<Sparkles className="size-4" />}
              title="新着"
              items={data.latest}
            />
          </>
        )}
      </div>
    </div>
  )
}
