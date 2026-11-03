'use client'

import { Building2, CalendarClock, CalendarRange, Flag, Megaphone, Users } from 'lucide-react'

import { MenuRow } from '@/components/common/MenuRow'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdminOverview } from '@/lib/api/queries/admin'

import { AdminFrame, LoadError, StatusBadge } from './parts'

/** 件数。単位は小さく添える */
function Count({ value, unit }: { value: number; unit: string }) {
  return (
    <span className="text-sm text-muted-foreground tabular-nums">
      {value}
      {unit}
    </span>
  )
}

/**
 * 管理画面のトップ。
 *
 * **各一覧への入口と件数だけを置く。** 旧トップは件数のタイルに加えて
 * 「最近作成されたイベント」「最近の新規ユーザー」を5件ずつ並べていたが、
 * どちらも各一覧を新しい順で開けば先頭に出る。入口で同じものを
 * もう一度読ませない（マイページで件数タイルとカレンダーをやめたのと同じ）。
 *
 * **通報だけは「未処理の数」を出し、あれば強調する。** ほかの数は
 * 眺めるための総数だが、これは今やることの数。
 */
export default function AdminHomeScreen() {
  const { data, isPending, error } = useAdminOverview()

  return (
    <AdminFrame back={null} title="管理画面" error={error}>
      {error ? (
        <div className="mt-6">
          <LoadError />
        </div>
      ) : isPending ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <MenuRow
            href="/admin/reports"
            title="通報"
            icon={<Flag className="size-5" />}
            meta={
              data.pendingReports > 0 ? (
                <StatusBadge tone="emphasis">未処理 {data.pendingReports}件</StatusBadge>
              ) : (
                <span className="text-sm text-muted-foreground">未処理なし</span>
              )
            }
          />
          <MenuRow
            href="/admin/events"
            title="イベント"
            icon={<CalendarRange className="size-5" />}
            meta={<Count value={data.events} unit="件" />}
          />
          <MenuRow
            href="/admin/pre-events"
            title="日程調整"
            icon={<CalendarClock className="size-5" />}
            meta={<Count value={data.preEvents} unit="件" />}
          />
          <MenuRow
            href="/admin/users"
            title="ユーザー"
            icon={<Users className="size-5" />}
            meta={<Count value={data.users} unit="人" />}
          />
          <MenuRow
            href="/admin/orgs"
            title="グループ"
            icon={<Building2 className="size-5" />}
            meta={<Count value={data.orgs} unit="件" />}
          />
          <MenuRow
            href="/admin/announcements"
            title="お知らせ"
            icon={<Megaphone className="size-5" />}
            meta={<Count value={data.announcements} unit="件" />}
          />
        </div>
      )}
    </AdminFrame>
  )
}
