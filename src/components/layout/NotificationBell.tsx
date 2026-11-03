'use client'

import * as React from 'react'
import Link from 'next/link'
import { Bell } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { NotificationRow } from '@/components/notification/NotificationRow'
import {
  useMarkNotificationsSeen,
  useNotificationSummary,
  useRefreshNotifications,
} from '@/lib/api/queries/notifications'
import { useViewer } from '@/hooks/useViewer'

/**
 * ヘッダーのベル。
 *
 * **未ログインでは何も出さず、リクエストも投げない。** 全ページに出るので、
 * 匿名の閲覧者が開くたびに401が1本飛ぶことになる。`status === 'loading'` の
 * 間も出さない — ヘッダーの既存の規律どおり、どちらかを仮に出すと必ず
 * 一瞬だけ嘘をつく。
 */
export function NotificationBell() {
  const { status } = useViewer()
  const authed = status === 'authed'

  const [open, setOpen] = React.useState(false)
  const { data, isPending } = useNotificationSummary(authed)
  const markSeen = useMarkNotificationsSeen()
  const refresh = useRefreshNotifications()

  if (!authed) return null

  /*
    **開いたら既読にし、閉じたときに取り直す。**

    開いている間に取り直すと、読んでいる最中にバッジと強調が消えて、
    何が新しかったのかが分からなくなる。既読位置を動かすのはここと
    一覧画面を開いたときの2つだけ（画面遷移のたびに動かすと、
    連続編集がまとまらなくなる）。
  */
  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) {
      markSeen.mutate()
    } else {
      void refresh()
    }
  }

  const unread = data?.unread ?? 0

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {/* 高さの規則は隣のハンバーガーと同じ（SiteHeader の説明を参照） */}
        <Button
          variant="default"
          size="icon-sm"
          className="relative max-md:size-11"
          aria-label={unread > 0 ? `通知（未読${unread}件）` : '通知'}
        >
          <Bell className="size-5" />
          {unread > 0 ? (
            <span
              // 数字はベルの上では読めないので、点で示して数は aria-label に持たせる
              aria-hidden
              className="absolute top-1 right-1 size-2 rounded-4xl bg-primary ring-2 ring-background"
            />
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 gap-0 p-0">
        <div className="flex items-baseline justify-between px-3 py-2.5">
          <span className="text-sm font-medium text-foreground">通知</span>
          {unread > 0 ? (
            <span className="text-xs text-muted-foreground">未読 {unread}件</span>
          ) : null}
        </div>

        {isPending ? (
          <div className="space-y-2 px-3 pb-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" />
            ))}
          </div>
        ) : !data || data.recent.length === 0 ? (
          <p className="px-3 pb-3 text-sm text-muted-foreground">通知はありません。</p>
        ) : (
          <ul className="rule-y">
            {data.recent.map((notification) => (
              <li key={notification.id} onClick={() => setOpen(false)}>
                <NotificationRow notification={notification} compact />
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border">
          <Link
            href="/dashboard/notifications"
            onClick={() => setOpen(false)}
            className="block px-3 py-2.5 text-sm text-primary transition-colors hover:bg-muted"
          >
            すべて見る
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
