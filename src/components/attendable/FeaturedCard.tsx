import Link from 'next/link'
import { CalendarRange, CircleSlash, Link2, MapPin, Users } from 'lucide-react'

import { CandidatesBadge, DateBadge } from '@/components/event/DateBadge'
import { DeadlineText } from '@/components/event/DeadlineText'
import { UserAvatar } from '@/components/event/EventInfoRow'
import { isUrlLocation } from '@/components/event/location'
import { cn } from '@/lib/utils'

import { primaryDate, scheduleNote, type Attendable } from './attendable'

/**
 * いちばん近いものを出す横長のカード。
 *
 * **一覧のカードを引き伸ばしたものではない。** 横に組んで、日付・題名・
 * 場所・人数・締切を1行ぶんの高さに収める。マイページの上端で
 * 「次に何があるか」を読み切らせるための形。
 *
 * **大きくしない。** 出すのは数件なので、目立たせる相手がいない。
 * 高さを使うほど、下にある続きへの入口が画面の外へ出ていく。
 * 語彙は `AttendableCard` と同じ（同じ日めくり、同じ人数の書き方）。
 */
export function FeaturedAttendableCard({
  item,
  className,
}: {
  item: Attendable
  className?: string
}) {
  const date = primaryDate(item.schedule)
  const note = scheduleNote(item.schedule)
  const remaining =
    item.people.capacity != null ? item.people.capacity - item.people.count : null

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:bg-accent focus-within:ring-3 focus-within:ring-ring/50',
        className
      )}
    >
      {/* 候補が1つも無い日程調整は日付を出せない。枠だけ残すと読み込み中に見える */}
      {item.schedule.kind === 'candidates' && item.schedule.options.length > 0 ? (
        <CandidatesBadge count={item.schedule.options.length} size="sm" />
      ) : date ? (
        <DateBadge date={date} size="sm" />
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground">
          <CalendarRange className="size-4" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        {/* 中止は題名の上に出す。読んでから気づくのでは遅い */}
        {item.cancelled ? (
          <span className="mb-1 inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-[11px] font-bold text-destructive">
            <CircleSlash className="size-3" aria-hidden />
            中止
          </span>
        ) : null}

        <h3 className="text-base leading-snug font-bold text-foreground">
          {/* after:inset-0 でカード全体が押せる */}
          <Link
            href={item.href}
            className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-xl"
          >
            {item.title}
          </Link>
        </h3>

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {note ? <span>{note}</span> : null}

          {item.location ? (
            <span className="flex min-w-0 items-center gap-1">
              {/* 場所の欄はURLも受ける。オンラインの会場にピンを出すと現地でやるように読める */}
              {isUrlLocation(item.location) ? (
                <Link2 className="size-3.5 shrink-0" />
              ) : (
                <MapPin className="size-3.5 shrink-0" />
              )}
              <span className="line-clamp-1">{item.location}</span>
            </span>
          ) : null}

          <span className="flex shrink-0 items-center gap-1.5">
            {item.people.avatars.length > 0 ? (
              <span className="flex -space-x-2">
                {item.people.avatars.map((u) => (
                  <UserAvatar key={u.id} name={u.displayName} src={u.avatar} size="xs" />
                ))}
              </span>
            ) : (
              <Users className="size-3.5" />
            )}
            {item.people.count}
            {item.people.capacity != null ? ` / ${item.people.capacity}` : ''}
            {item.people.unit}
          </span>

          <DeadlineText
            deadline={item.deadline}
            remaining={remaining}
            capacity={item.people.capacity}
            className="text-xs"
          />
        </div>
      </div>
    </div>
  )
}
