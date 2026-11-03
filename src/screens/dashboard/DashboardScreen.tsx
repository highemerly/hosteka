'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Bell,
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  ChevronRight,
  LogOut,
  MonitorSmartphone,
  Search,
  Send,
  Trash2,
  UserPen,
  Users,
} from 'lucide-react'

import {
  toEventAttendable,
  toPreEventAttendable,
  type Attendable,
} from '@/components/attendable/attendable'
import { FeaturedAttendableCard } from '@/components/attendable/FeaturedCard'
import { MenuRow } from '@/components/common/MenuRow'
import { UserAvatar } from '@/components/event/EventInfoRow'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useConfirmedLogout } from '@/hooks/useConfirmedLogout'
import { ApiClientError } from '@/lib/api/client'
import { useDashboard } from '@/lib/api/queries/dashboard'
import { useNotificationSummary } from '@/lib/api/queries/notifications'
import { userProfilePath } from '@/lib/user-handle'
import { findPlatform } from '@/screens/auth/sign-in-platforms'
import type { DashboardDto } from '@/app/api/v1/dashboard/route'

const PATH = '/dashboard'

/**
 * 数件だけ出した節の下に置く2つの入口。
 *
 * **続きと、まだ知らないものは別の行き先。** 「すべてみる」は自分のもの、
 * 「他の〜を探す」は自分が関わっていないもの。左右に並べて、
 * どちらへ行きたいかをその場で選べるようにする。
 *
 * 見出しの右肩に小さな文字で置いていたが、押せるものだと分かりにくく、
 * 狭い画面では題名に押されて改行していた。
 */
function SectionActions({
  allHref,
  findHref,
  findLabel,
}: {
  allHref: string
  findHref: string
  findLabel: string
}) {
  return (
    /*
      **狭い画面でも2つを1行に置く。** 折り返すと縦にボタンが積まれ、
      節の切れ目が分からなくなる。半分ずつに割り、入りきらないぶんは
      文字を詰めて記号を落とす（語のほうが行き先を言っている）。
    */
    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:gap-3">
      <Button variant="default" asChild className="w-full max-sm:px-2 max-sm:text-sm sm:w-auto">
        <Link href={allHref}>
          すべてみる
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </Button>
      <Button variant="default" asChild className="w-full max-sm:px-2 max-sm:text-sm sm:w-auto">
        <Link href={findHref}>
          <Search className="size-4 max-sm:hidden" aria-hidden />
          {findLabel}
        </Link>
      </Button>
    </div>
  )
}

/**
 * 節の中身。**広い画面では2件を横に並べ、狭い画面では1件だけ出す。**
 *
 * 狭い画面で2件目を縦に積むと、すぐ下の入口と次の節が画面の外へ出ていく。
 * 横長のカードなので、1件でも幅は余らない。
 *
 * 続きは下の「すべてみる」が受け持つので、3件目は出さない
 * （出す件数は `/api/v1/dashboard` の `UPCOMING_LIMIT` が決める）。
 */
function FeaturedRow({ items }: { items: Attendable[] }) {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {items.slice(0, 2).map((item, i) => (
        <FeaturedAttendableCard
          key={item.id}
          item={item}
          /* 2件目は狭い画面では出さない。高さは揃える（横に並ぶと段差が見える） */
          className={i === 0 ? 'h-full' : 'h-full max-sm:hidden'}
        />
      ))}
    </div>
  )
}

/**
 * 中身が無い節。**節ごと消さない** — 何をすれば埋まるのかをここで示す。
 *
 * **高さは中身のあるカード（FeaturedCard）に揃える。** 余白を大きく取ると、
 * 何も無い節のほうが画面を占め、下の入口と次の節を押し出す。
 */
function EmptyCard({
  message,
  action,
}: {
  message: string
  action: { href: string; label: string }
}) {
  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4 text-center">
      <p className="text-sm text-foreground">{message}</p>
      <Button variant="primary" className="mt-3" asChild>
        <Link href={action.href}>
          <CalendarPlus className="size-4" />
          {action.label}
        </Link>
      </Button>
    </div>
  )
}

/**
 * 投稿の権限の呼び名。
 *
 * **`null` は「分からない」**（この列より前に入ったユーザー）。
 * 「読み取りのみ」と言い切ると、実際には投稿できる人に入り直しを促すことになる。
 *
 * **投稿の権限を頼めないプラットフォームは、保存した値を見ない。**
 * Pleroma・X・Discord は読み取りでしか入れないので、列が `null` でも
 * 「不明」ではない（X と Discord はこの列を書かない）。
 */
function writePermissionLabel(value: boolean | null, canRequestWrite: boolean): string {
  if (!canRequestWrite) return '読み取りのみ'
  if (value === true) return '投稿できる'
  if (value === false) return '読み取りのみ'
  return '権限は不明'
}

/**
 * 自分のアカウント。**ページの最後に置く。**
 *
 * 日々使うのは上の予定で、ここは「どのアカウントで入っているか」を
 * 確かめる場所。
 */
function AccountSection({ account }: { account: DashboardDto['account'] }) {
  const platform = findPlatform(account.platform)
  const requestLogout = useConfirmedLogout()
  // ヘッダーのベルと同じクエリ。キーを共有しているので余分には取りにいかない
  const unread = useNotificationSummary(true).data?.unread ?? 0

  return (
    <section className="mt-10">
      <h2 className="text-base font-bold text-foreground">アカウント</h2>

      {/*
        **面も枠も持たせない。** 下のメニューと同じ姿にすると、
        読むだけの素性が押せるものに見える。

        名前とアイコンだけは公開ページへのリンクにしてある。**自分が
        他人からどう見えているかを確かめる導線がここにしかない。**
      */}
      <div className="mt-3 flex items-center gap-3">
        <UserAvatar name={account.displayName} src={account.avatar} />
        <div className="min-w-0">
          {/*
            名前とIDだけをリンクにする。**プラットフォームと権限は
            外に出ていないもの**なので、同じ的に含めない。
          */}
          <Link
            href={userProfilePath(account)}
            className="block min-w-0 transition-colors hover:text-primary"
          >
            <span className="block truncate font-bold text-foreground">
              {account.displayName}
            </span>
            <span className="block truncate text-sm text-muted-foreground">
              @{account.username}@{account.server}
            </span>
          </Link>
          {/* 項目名と値の表にしない。2つしかなく、どちらも読み方に迷わない */}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              {platform ? <platform.icon className="size-4" aria-hidden /> : null}
              {platform?.label ?? account.platform}
            </span>
            <span>
              {/* 表に無いプラットフォームは決めつけず、保存した値に従う */}
              {writePermissionLabel(account.hasWritePermission, platform?.canRequestWrite ?? true)}
            </span>
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {/*
          ヘッダーのベルと同じものへの入口。件数は同じクエリを共有するので、
          2つの数が食い違うことはない
        */}
        <MenuRow
          href="/dashboard/notifications"
          title="通知を確認する"
          icon={<Bell className="size-5" />}
          meta={unread > 0 ? `未読 ${unread}件` : undefined}
        />
        <MenuRow
          href="/account"
          title="プロフィールを変更する"
          icon={<UserPen className="size-5" />}
        />
        <MenuRow
          href="/account/sessions"
          title="ログイン履歴を確認する"
          icon={<MonitorSmartphone className="size-5" />}
        />
        {/* **ここで実際にログアウトする**（確認を挟む） */}
        <MenuRow
          onClick={() => void requestLogout()}
          title="ログアウト"
          icon={<LogOut className="size-5" />}
        />
        <MenuRow
          href="/account/delete"
          title="アカウントを削除する"
          icon={<Trash2 className="size-5" />}
        />
      </div>
    </section>
  )
}

/**
 * マイページ。
 *
 * **取得は `GET /api/v1/dashboard` の1往復。** 旧マイページは
 * `page.tsx` が prisma を9本叩き、さらにカレンダーが週替わりで
 * `/api/v1/events` を叩いていた。
 *
 * **件数のタイルは置かない。** 「主催3件・参加2件」と数だけ言われても、
 * 押して開くまで何があるのかは分からない。同じ場所にカードを出せば、
 * 開かずに次の予定が読める。数は一覧の側にある。
 *
 * **カレンダーも置かない。** 月の枠を描いても自分の予定は月に数件しか
 * 入らず、空のマス目が場所を取るだけだった。
 */
export default function DashboardScreen() {
  const { data, isPending, error } = useDashboard()

  const unauthenticated = error instanceof ApiClientError && error.code === 'UNAUTHENTICATED'

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
        マイページ
      </h1>

      {unauthenticated ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-foreground">マイページを見るにはログインが必要です。</p>
          <Button variant="primary" className="mt-4" asChild>
            <Link href={`/auth/signin?callbackUrl=${encodeURIComponent(PATH)}`}>ログイン</Link>
          </Button>
        </div>
      ) : error ? (
        <p className="mt-6 rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          読み込めませんでした。時間をおいて開き直してください。
        </p>
      ) : isPending ? (
        /* 骨組みは実際の並びに合わせる。違う形を出すと、読み込み後に飛ぶ */
        <div className="mt-6 space-y-8">
          {Array.from({ length: 2 }, (_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-12 w-72 max-w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <section className="mt-6">
            <h2 className="text-base font-bold text-foreground">
              開催日の近いあなたのイベント
            </h2>
            {data.upcoming.length === 0 ? (
              <EmptyCard
                message="開催予定のイベントはありません。"
                action={{ href: '/events/create', label: 'イベントを作成' }}
              />
            ) : (
              <FeaturedRow items={data.upcoming.map(toEventAttendable)} />
            )}
            <SectionActions
              allHref="/dashboard/my-events"
              findHref="/events"
              findLabel="他のイベントを探す"
            />
          </section>

          <section className="mt-8">
            <h2 className="text-base font-bold text-foreground">最近回答した日程調整</h2>
            {data.recentPreEvents.length === 0 ? (
              <EmptyCard
                message="回答した日程調整はありません。"
                action={{ href: '/pre-events/create', label: '日程調整を作成' }}
              />
            ) : (
              /* イベントと同じ形。件数も並べ方も揃える */
              <FeaturedRow items={data.recentPreEvents.map(toPreEventAttendable)} />
            )}
            <SectionActions
              allHref="/dashboard/my-pre-events"
              findHref="/pre-events"
              findLabel="他の日程調整を探す"
            />
          </section>

          <section className="mt-8">
            <h2 className="text-base font-bold text-foreground">幹事向けメニュー</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <MenuRow
                href="/dashboard/my-events?role=created"
                title="主催のイベントをみる"
                icon={<CalendarRange className="size-5" />}
              />
              <MenuRow
                href="/dashboard/my-pre-events?role=created"
                title="主催の日程調整をみる"
                icon={<CalendarClock className="size-5" />}
              />
              <MenuRow
                href="/dashboard/my-orgs"
                title="グループ"
                icon={<Users className="size-5" />}
              />
              {/* 予約投稿は Mastodon にしか無い機能。使えない人には出さない
                  （「できません」と断るより、できない状態を作らない） */}
              {data.account.platform === 'mastodon' ? (
                <MenuRow
                  href="/dashboard/scheduled_post"
                  title="予約投稿"
                  icon={<Send className="size-5" />}
                />
              ) : null}
            </div>
          </section>

          <AccountSection account={data.account} />
        </>
      )}
    </div>
  )
}
