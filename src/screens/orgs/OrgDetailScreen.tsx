'use client'

import * as React from 'react'
import Link from 'next/link'
import { CalendarPlus, ExternalLink, Mail, Pencil, Users } from 'lucide-react'

import { AttendableTabs, type AttendableTab } from '@/components/attendable/AttendableTabs'
import { UserAvatar } from '@/components/event/EventInfoRow'
import { ShareBar } from '@/components/event/ShareBar'
import { buildAnypostContactUrl } from '@/components/event/share-targets'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import SafeMarkdown from '@/components/SafeMarkdown'
import { useViewer } from '@/hooks/useViewer'
import { useOrg, useOrgEvents, useOrgPreEvents } from '@/lib/api/queries/orgs'
import { formatJstDate } from '@/lib/jst'
import { userProfilePath } from '@/lib/user-handle'

/**
 * 管理者の役割。
 *
 * **作成者を別に出す。** 役割としては管理責任者だが、外せない・変えられない
 * 点が違う（外すとグループが管理不能になる）。`OrgFormScreen` の表示と
 * 揃えてある。
 */
function roleLabel(
  admin: { role: string; user: { id: string } },
  creatorId: string | null
): string {
  if (admin.user.id === creatorId) return '作成者'
  return admin.role === 'admin' ? '管理責任者' : 'スタッフ'
}

/**
 * グループのページ。
 *
 * **イベントと日程調整は一覧と同じカードで描く**（`AttendableCard`）。
 * 旧画面は `OrgEventList`(274) / `OrgPreEventList`(213) という専用の
 * 一覧を持っていて、同じイベントがグループのページだけ違う姿で出ていた。
 *
 * 誰が管理者かは公開情報なので、未ログインでも見える。
 */
export default function OrgDetailScreen({ slug }: { slug: string }) {
  const { viewer } = useViewer()
  const { data: org, isPending, error } = useOrg(slug)
  const [tab, setTab] = React.useState<AttendableTab>('events')
  const [page, setPage] = React.useState(1)
  // 開いていないタブは取りにいかない
  const events = useOrgEvents(slug, page, { enabled: tab === 'events' })
  const preEvents = useOrgPreEvents(slug, page, { enabled: tab === 'pre-events' })

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    )
  }

  if (error || !org) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          グループを読み込めませんでした。
        </p>
      </div>
    )
  }

  /*
    編集できるか。**ビューア Cookie から出しているので UI の出し分けだけ。**
    偽っても編集はできない（`PUT /api/v1/orgs/[orgId]` が `requireOrgAdminRole`
    で確かめる）。staff は編集できないので role まで見る。
  */
  const canEdit = Boolean(
    viewer &&
      (org.creatorId === viewer.id ||
        org.admins.some((a) => a.user.id === viewer.id && a.role === 'admin'))
  )

  const contactUrl = buildAnypostContactUrl({
    url: typeof window === 'undefined' ? '' : window.location.href,
    title: org.name,
    targets: org.admins.map((a) => a.user),
    viewer: viewer ? { id: viewer.id, server: viewer.server, platform: viewer.platform } : null,
  })

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {org.name}
        </h1>
        {canEdit ? (
          <Button variant="default" size="sm" asChild>
            <Link href={`/orgs/${org.slug}/edit`}>
              <Pencil className="size-4" />
              グループを編集
            </Link>
          </Button>
        ) : null}
      </header>

      {/* 規模。数字の意味は語で言う。数字だけ並べても読めない */}
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">イベント</dt>
          <dd>
            <span className="font-medium text-foreground">{org.eventCount ?? 0}</span> イベント
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">日程調整</dt>
          <dd>
            <span className="font-medium text-foreground">{org.preEventCount}</span> 日程調整
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">のべ参加者</dt>
          <dd>
            <span className="font-medium text-foreground">{org.participantCount}</span> のべ参加者
          </dd>
        </div>
        <div>
          <dt className="sr-only">設立</dt>
          <dd>{formatJstDate(org.createdAt)}に設立</dd>
        </div>
      </dl>

      {org.relatedUrl ? (
        <p className="mt-3">
          {/* 外部サイトは中継ページを挟む。飛び先を先に見せるため */}
          <Link
            href={`/external-link?url=${encodeURIComponent(org.relatedUrl)}`}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ExternalLink className="size-4" />
            {org.relatedUrl}
          </Link>
        </p>
      ) : null}

      {org.description ? (
        <div className="mt-5">
          <SafeMarkdown>{org.description}</SafeMarkdown>
        </div>
      ) : null}

      <section className="mt-6">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-foreground">管理者</h2>
          {contactUrl ? (
            <Button variant="default" size="xs" asChild>
              <a href={contactUrl} target="_blank" rel="noreferrer">
                <Mail className="size-3.5" />
                連絡する
              </a>
            </Button>
          ) : null}
        </div>

        {/*
          **役割まで出す。** 管理責任者とスタッフではできることが違う
          （グループそのものを編集できるのは管理責任者だけ）。名前だけ
          並べると、誰に頼めばいいのかが分からない。
        */}
        <ul className="mt-2 flex flex-wrap gap-2">
          {org.admins.map((admin) => (
            <li key={admin.id}>
              {/*
                **飛び先は Hosteka の中のその人のページ。** 以前は
                `https://<server>/@<username>` を直に組んでいて、X と
                Discord の管理者では開けない URL になっていた
                （`https://x.com/@alice` は Fediverse の書き方、
                `https://discord.com/@bob` はページが無い）。
                相手のSNSを開くのは、そのページの側にある。
              */}
              <Link
                href={userProfilePath(admin.user)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-sm transition-colors hover:bg-accent"
              >
                <UserAvatar name={admin.user.displayName} src={admin.user.avatar} size="xs" />
                <span className="text-foreground">{admin.user.displayName}</span>
                <span className="text-xs text-muted-foreground">
                  @{admin.user.username}@{admin.user.server}
                </span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {roleLabel(admin, org.creatorId)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <AttendableTabs
        tab={tab}
        onTabChange={setTab}
        page={page}
        onPageChange={setPage}
        counts={{ events: org.eventCount ?? 0, preEvents: org.preEventCount }}
        list={tab === 'events' ? events : preEvents}
        emptyLabel={{
          events: 'このグループのイベントはまだありません。',
          preEvents: 'このグループの日程調整はまだありません。',
        }}
      />

      {/*
        操作列。**大きさは列の中で全部そろえる**（docs/DESIGN_GUIDELINES.md §7）。
        `size="sm"` — イベント詳細の操作列、および情報行の「カレンダーに追加」と
        同じ高さ。`ShareBar` の中のボタンも同じ size を持つ。
        差を付けると、重要度の差ではなく作りの粗さとして読まれる。
      */}
      <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-border pt-6">
        <Button variant="default" size="sm" asChild>
          <Link href="/events/create">
            <CalendarPlus className="size-4" />
            このグループでイベントを作成
          </Link>
        </Button>
        <Button variant="default" size="sm" asChild>
          <Link href="/dashboard/my-orgs">
            <Users className="size-4" />
            あなたのグループ
          </Link>
        </Button>
        <ShareBar title={org.name} />
      </div>
    </div>
  )
}
