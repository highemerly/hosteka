'use client'

import * as React from 'react'
import Link from 'next/link'
import { MessageSquare } from 'lucide-react'

import { UserAvatar } from '@/components/event/EventInfoRow'
import { userProfilePath } from '@/lib/user-handle'
import { cn } from '@/lib/utils'
import type {
  PreEventDateOptionDto,
  PreEventRespondentDto,
} from '@/server/serializers/pre-event'

import { VOTE_MARK } from './vote'

/** 「9/14」。候補日を短く指すための表記 */
function shortDay(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(iso))
}

/**
 * 誰がどう答えたか。
 *
 * **候補日ごとの集計とは別に要る。** 上の一覧は「どの日が集まっているか」を
 * 見るためのもので、こちらは「誰が来られるのか」「何と言っているか」を
 * 見るためのもの。**コメントはここにしか出せない** — 回答ごとに1つ書く
 * ものなので、候補日の側に置き場が無い。
 *
 * ○△×は記号と文字の両方で示す。色だけで分けると、色覚特性によっては
 * 区別が付かない（docs/DESIGN_GUIDELINES.md）。
 */
export function RespondentList({
  respondents,
  dateOptions,
  viewerId,
}: {
  respondents: PreEventRespondentDto[]
  dateOptions: PreEventDateOptionDto[]
  /** 自分の回答を目立たせるため。未ログインなら null */
  viewerId?: string | null
}) {
  if (respondents.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        まだ誰も回答していません。
      </p>
    )
  }

  return (
    <ul className="space-y-2">
      {respondents.map((respondent) => {
        const isSelf = viewerId != null && respondent.user.id === viewerId
        return (
          <li
            key={respondent.user.id}
            className={cn(
              'rounded-xl border p-3',
              isSelf ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'
            )}
          >
            <div className="flex items-start gap-3">
              <UserAvatar
                name={respondent.user.displayName}
                src={respondent.user.avatar}
                size="sm"
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link
                    href={userProfilePath(respondent.user)}
                    className="text-sm font-medium text-foreground hover:underline"
                  >
                    {respondent.user.displayName}
                  </Link>
                  {isSelf ? (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                      自分
                    </span>
                  ) : null}
                  <span className="truncate text-xs text-muted-foreground">
                    @{respondent.user.username}@{respondent.user.server}
                  </span>
                </div>

                {/* 候補日ごとの○△×。日付と記号を並べて、表を読ませない */}
                <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                  {dateOptions.map((option) => {
                    const vote = respondent.votes[option.id]
                    return (
                      <li
                        key={option.id}
                        className={cn(
                          'text-xs tabular-nums',
                          vote === 'available'
                            ? 'font-medium text-foreground'
                            : 'text-muted-foreground'
                        )}
                      >
                        {shortDay(option.startDate)}{' '}
                        <span aria-hidden>{vote ? VOTE_MARK[vote] : '－'}</span>
                        <span className="sr-only">
                          {vote === 'available'
                            ? '参加できる'
                            : vote === 'maybe'
                              ? '未定'
                              : vote === 'unavailable'
                                ? '参加できない'
                                : '未回答'}
                        </span>
                      </li>
                    )
                  })}
                </ul>

                {respondent.comment ? (
                  <p className="mt-2 flex gap-2 rounded-lg bg-[var(--surface-subtle)] px-3 py-2 text-sm text-foreground">
                    <MessageSquare
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 break-words whitespace-pre-wrap">
                      {respondent.comment}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
