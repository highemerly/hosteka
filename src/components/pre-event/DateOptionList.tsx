'use client'

import * as React from 'react'
import { Crown } from 'lucide-react'

import { DateBadge } from '@/components/event/DateBadge'
import { UserAvatar } from '@/components/event/EventInfoRow'
import { cn } from '@/lib/utils'
import type { PreEventDateOptionDto } from '@/server/serializers/pre-event'

import { formatOptionRange } from './date-option-label'
import { bestOptionId, hasTiedBest, VOTE_MARK } from './vote'

function CountCell({ mark, count, muted }: { mark: string; count: number; muted?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-baseline gap-0.5 tabular-nums',
        muted ? 'text-muted-foreground' : 'text-foreground'
      )}
    >
      <span aria-hidden className="text-muted-foreground">
        {mark}
      </span>
      {count}
    </span>
  )
}

/**
 * 候補日ごとの回答。
 *
 * **日付は詳細ページと同じ日めくりで出す。** イベント詳細の左上と
 * 同じ形なので、「この四角＝日付」という対応が画面をまたいで通じる。
 *
 * 最も集まっている日に王冠を付ける。**自動では決めない** — 主催者が
 * 決めるための目安なので、同点のときは全部に付けず、
 * 「同じ数で並んでいる」と書く。
 */
export function DateOptionList({ options }: { options: PreEventDateOptionDto[] }) {
  const best = bestOptionId(options)
  const tied = hasTiedBest(options)

  if (options.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        候補日がまだありません。
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {options.map((option) => {
          const isBest = !tied && option.id === best
          const range = formatOptionRange(option.startDate, option.endDate)
          return (
            <li
              key={option.id}
              /*
                **有力な候補を色で囲まない。** 青の枠と面で塗ると、同じ画面に
                ある操作ボタン（幹事メニュー＝state）と同じ見た目になり、
                「押せるもの」に見える。
                ここは押せない情報なので、強弱は王冠と文字の太さで付ける
                （docs/DESIGN_GUIDELINES.md「立体表現よりコントラスト」）。
              */
              className="rounded-xl border border-border bg-card p-3"
            >
              <div className="flex items-start gap-3">
                <DateBadge date={option.startDate} size="sm" />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {/* 時刻を決めていない候補では空になる。日付は左の日めくりが出す */}
                    {range ? (
                      <span className="text-sm font-medium text-foreground">{range}</span>
                    ) : null}
                    {isBest ? (
                      <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-subtle)] px-1.5 py-0.5 text-xs font-bold text-foreground">
                        <Crown className="size-3.5" aria-hidden />
                        いちばん集まっています
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
                    <CountCell mark={VOTE_MARK.available} count={option.counts.available} />
                    <CountCell mark={VOTE_MARK.maybe} count={option.counts.maybe} />
                    <CountCell
                      mark={VOTE_MARK.unavailable}
                      count={option.counts.unavailable}
                      muted
                    />
                  </div>

                  {/* ○と△の人だけ顔を出す。参加できない人の一覧に意味はない */}
                  {option.attendees.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      {option.attendees.map((a) => (
                        <span
                          key={a.user.id}
                          title={`${a.user.displayName}（${VOTE_MARK[a.vote]}）`}
                          className={cn(a.vote === 'maybe' && 'opacity-60')}
                        >
                          <UserAvatar
                            name={a.user.displayName}
                            src={a.user.avatar}
                            size="xs"
                          />
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {tied ? (
        <p className="text-xs text-muted-foreground">
          同じ数で並んでいる候補があります。主催者が決めます。
        </p>
      ) : null}
    </div>
  )
}
