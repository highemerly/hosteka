'use client'

import type * as React from 'react'

import { AttendableCard } from '@/components/attendable/AttendableCard'
import { toEventAttendable, toPreEventAttendable } from '@/components/attendable/attendable'
import { Pagination } from '@/components/common/Pagination'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Skeleton } from '@/components/ui/skeleton'
import type { ListResult } from '@/lib/api/client'
import type { EventListItemDto } from '@/server/serializers/event'
import type { PreEventListItemDto } from '@/server/serializers/pre-event'

export type AttendableTab = 'events' | 'pre-events'

type ListQuery = {
  data?: ListResult<EventListItemDto> | ListResult<PreEventListItemDto>
  isPending: boolean
  error: unknown
}

/**
 * 主催しているイベントと日程調整を、切り替えとページ送りで並べる。
 *
 * **ユーザーのページとグループのページが同じ部品を使う。** 出している
 * ものも操作も同じなので、別々に組むと同じイベントが入り口によって
 * 違う姿で並ぶ（以前グループのページがそうなっていた）。
 *
 * 切り替えと現在のページは呼び出し側が持つ。どちらのタブを取りにいくかの
 * 判断（`enabled`）に要るので、ここに閉じ込められない。
 */
export function AttendableTabs({
  tab,
  onTabChange,
  page,
  onPageChange,
  counts,
  list,
  emptyLabel,
  title,
  filter,
}: {
  tab: AttendableTab
  onTabChange: (next: AttendableTab) => void
  page: number
  onPageChange: (next: number) => void
  counts: { events: number; preEvents: number }
  /** いま開いているタブの一覧 */
  list: ListQuery
  emptyLabel: { events: string; preEvents: string }
  /**
   * 一覧の見出し。**何で絞った一覧なのかが周りから読めないときに付ける。**
   * ユーザーのページでは、参加しているものまで並んでいるように見えるので
   * 「主催」と言う。グループのページはグループのものしか無いので要らない。
   */
  title?: string
  /** 切り替えの横に並べる絞り込み。ページ送りを先頭へ戻すのは呼び出し側 */
  filter?: React.ReactNode
}) {
  const items = list.data?.items ?? []
  const totalPages = list.data?.meta.totalPages ?? 1

  return (
    <section className="mt-8">
      {title ? <h2 className="mb-2 text-sm font-medium text-foreground">{title}</h2> : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          aria-label={title ?? '表示するもの'}
          value={tab}
          onValueChange={(next) => {
            onTabChange(next)
            // **切り替えたら先頭へ戻す。** 3ページ目のまま移ると空に見える
            onPageChange(1)
          }}
          options={[
            { value: 'events', label: `イベント ${counts.events}` },
            { value: 'pre-events', label: `日程調整 ${counts.preEvents}` },
          ]}
        />
        {filter}
      </div>

      {list.isPending ? (
        <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-44 rounded-xl" />
            </li>
          ))}
        </ul>
      ) : list.error ? (
        <p className="mt-6 rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          読み込めませんでした。時間をおいて開き直してください。
        </p>
      ) : items.length === 0 ? (
        <p className="mt-6 rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {tab === 'events' ? emptyLabel.events : emptyLabel.preEvents}
        </p>
      ) : (
        <>
          <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.id}>
                <AttendableCard
                  item={
                    tab === 'events'
                      ? toEventAttendable(item as EventListItemDto)
                      : toPreEventAttendable(item as PreEventListItemDto)
                  }
                />
              </li>
            ))}
          </ul>

          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </>
      )}
    </section>
  )
}
