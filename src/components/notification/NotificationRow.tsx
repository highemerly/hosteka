'use client'

import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { formatJstDateTime } from '@/lib/jst'
import { KIND_LABEL_JA, notificationText } from '@/lib/notification-text'
import { cn } from '@/lib/utils'
import type { NotificationDto } from '@/server/serializers/notification'

/**
 * 通知1件。一覧とベルのポップオーバーで同じものを使う。
 *
 * **読ませる面なので、立体表現を付けない**（docs/DESIGN_GUIDELINES.md §1）。
 * 未読の面を状態ボタンと同じ濃さにすると、読むだけの知らせが押せるものに見える。
 *
 * **種別のバッジは中立色。青は未読のために空けておく** — タグを青にすると、
 * 重要な情報と同じ色が並んで強弱が消える。
 */
export function NotificationRow({
  notification,
  compact = false,
}: {
  notification: NotificationDto
  compact?: boolean
}) {
  const text = notificationText(notification)

  const body = (
    <div
      className={cn(
        'flex items-start gap-3 px-3 transition-colors',
        compact ? 'py-2.5' : 'py-3',
        notification.href ? 'hover:bg-muted' : null,
        // 未読は淡い面で示す。強調のための青はここだけに使う
        notification.unread ? 'bg-primary/5' : null
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-sm text-foreground',
            notification.unread ? 'font-medium' : null,
            compact ? 'line-clamp-2' : null
          )}
        >
          {text}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <Badge variant="secondary">{KIND_LABEL_JA[notification.kind]}</Badge>
          {/*
            **絶対表記にする。** 「3分前」は時計が要るので描き直しでずれるし、
            あとから見返したときに「いつの話か」が分からない
          */}
          <span className="text-xs text-muted-foreground">
            {formatJstDateTime(notification.occurredAt, {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      </div>
    </div>
  )

  /*
    対象が消えていれば押せない。**押すと404になることは許容する** —
    消えた対象と管理者が無効化した対象は区別できず、確かめるには
    クエリが1本増える（シリアライザの説明を参照）。
  */
  return notification.href ? (
    <Link href={notification.href} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}
