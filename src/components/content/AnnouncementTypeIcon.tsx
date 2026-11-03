import { AlertTriangle, Info, Megaphone } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { AnnouncementType } from '@/schemas/announcement'

/**
 * 重要度の印。**一覧・詳細・バナー・管理画面で同じものを使う。**
 *
 * 各所で三項演算子を書くと、重要度を増やしたときに直し忘れる場所が出る。
 *
 * 色は2系統だけ（DESIGN_GUIDELINES「配色」）。**重要だけを `destructive`** に
 * 置き、残りは中立色。3つとも色を変えると、どれが重いのかを色が答えなくなる。
 */
const ICONS: Record<AnnouncementType, { Icon: typeof Info; className: string }> = {
  warning: { Icon: AlertTriangle, className: 'text-destructive' },
  info: { Icon: Info, className: 'text-primary' },
  low: { Icon: Megaphone, className: 'text-muted-foreground' },
}

export function AnnouncementTypeIcon({
  type,
  className,
}: {
  type: AnnouncementType
  className?: string
}) {
  const { Icon, className: tone } = ICONS[type]
  return <Icon className={cn('size-4 shrink-0', tone, className)} aria-hidden />
}
