'use client'

import * as React from 'react'
import Link from 'next/link'
import { ChevronDown, ExternalLink, Mail, Send, Settings } from 'lucide-react'

import { AttendableTabs, type AttendableTab } from '@/components/attendable/AttendableTabs'
import { UserAvatar } from '@/components/event/EventInfoRow'
import { buildAnypostMentionUrl } from '@/components/event/share-targets'
import { ShareBar } from '@/components/event/ShareBar'
import SafeMarkdown from '@/components/SafeMarkdown'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { useViewer } from '@/hooks/useViewer'
import {
  useUserEmail,
  useUserEvents,
  useUserPreEvents,
  useUserProfile,
} from '@/lib/api/queries/users'
import { formatJstDate } from '@/lib/jst'
import { findPlatform } from '@/screens/auth/sign-in-platforms'
import { profileSocialAccounts } from '@/screens/users/profile-social-accounts'

/**
 * 畳まずに出す所属グループの数。
 *
 * 掛け持ちしている人だと、ここが伸びてプロフィールの本文より先に
 * 場所を取る。3件あれば「どんなところに関わっているか」は伝わる。
 */
const VISIBLE_ORGS = 3

/**
 * ユーザーのページ。
 *
 * **グループのページ（`src/screens/orgs/OrgDetailScreen.tsx`）と同じ形にしてある。**
 * 出しているものも（名前・規模・一覧）ほとんど同じなので、別の組み方をすると
 * 同じイベントが入り口によって違う姿で並ぶ。
 *
 * 誰が何を主催しているかは公開情報なので、未ログインでも見える。
 * **メールアドレスだけは例外**（ログイン中の人が押して初めて取りにいく）。
 */
export default function UserProfileScreen({ handle }: { handle: string }) {
  const { viewer } = useViewer()
  const { data: profile, isPending, error } = useUserProfile(handle)
  const [tab, setTab] = React.useState<AttendableTab>('events')
  const [page, setPage] = React.useState(1)
  const [excludeOrgs, setExcludeOrgs] = React.useState(false)
  const scope = excludeOrgs ? 'personal' : 'all'
  const [revealEmail, setRevealEmail] = React.useState(false)
  const [orgsOpen, setOrgsOpen] = React.useState(false)
  const email = useUserEmail(handle, { enabled: revealEmail })
  // 開いていないタブは取りにいかない
  const events = useUserEvents(handle, scope, page, { enabled: tab === 'events' })
  const preEvents = useUserPreEvents(handle, scope, page, { enabled: tab === 'pre-events' })

  if (isPending) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-8">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          ユーザーを読み込めませんでした。
        </p>
      </div>
    )
  }

  const { user } = profile
  // 自分のページかどうか。ビューア Cookie なので**表示の出し分けだけ**
  const isSelf = viewer?.id === user.id
  const accounts = profileSocialAccounts(user, profile.socialAccounts)
  // 見出しの数字も下の一覧と同じ絞り込みに従う。ずれると件数と中身が合わない
  const stats = profile.stats[scope]

  /*
    **null ならボタンごと出さない。** 自分のページ（自分宛のメンションは
    誰にも届かない）と、Discord でログインしている人
    （`@name@discord.com` はどこでも解決しない）がそれに当たる。
  */
  const contactUrl = buildAnypostMentionUrl({
    targets: [user],
    viewer: viewer ? { id: viewer.id, server: viewer.server, platform: viewer.platform } : null,
  })

  const visibleOrgs = orgsOpen
    ? profile.organizations
    : profile.organizations.slice(0, VISIBLE_ORGS)
  const hiddenOrgCount = profile.organizations.length - VISIBLE_ORGS

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar name={user.displayName} src={user.avatar} size="md" />
          {/*
            **IDはここに出さない。** すぐ下のSNSの一覧が「メイン」として
            同じものを出すので、並べると同じ文字列が2行続く。
          */}
          <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {user.displayName}
          </h1>
        </div>
        {isSelf ? (
          <Button variant="default" size="sm" asChild>
            <Link href="/account">
              <Settings className="size-4" />
              プロフィールを編集
            </Link>
          </Button>
        ) : null}
      </header>

      {/* 規模。数字の意味は語で言う。数字だけ並べても読めない */}
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">主催イベント</dt>
          <dd>
            <span className="font-medium text-foreground">{stats.events}</span>{' '}
            主催イベント
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">主催日程調整</dt>
          <dd>
            <span className="font-medium text-foreground">{stats.preEvents}</span>{' '}
            主催日程調整
          </dd>
        </div>
        <div className="flex items-baseline gap-1">
          <dt className="sr-only">のべ参加者</dt>
          <dd>
            <span className="font-medium text-foreground">{stats.people}</span> のべ参加者
          </dd>
        </div>
        <div>
          <dt className="sr-only">利用開始</dt>
          <dd>{formatJstDate(profile.joinedAt)}に登録</dd>
        </div>
      </dl>

      {/*
        **ログインに使っているアカウントも並べる**（`profileSocialAccounts`）。
        Discord は開ける URL が無いのでリンクにしない — 押せるのに
        どこにも行かないものを作らない。
      */}
      <ul className="mt-5 flex flex-wrap items-center gap-2">
        {accounts.map((account, index) => {
          const platform = findPlatform(account.platform)
          const Icon = platform?.icon
          const label = (
            <>
              {Icon
                ? <Icon className={account.isLogin ? 'size-5' : 'size-4'} aria-hidden />
                : null}
              <span
                className={
                  account.isLogin
                    ? 'font-medium text-foreground'
                    : 'text-sm text-foreground'
                }
              >
                @{account.username}
                {platform?.needsServer ? `@${account.server}` : ''}
              </span>
              {account.isLogin ? (
                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
                  メイン
                </span>
              ) : null}
            </>
          )
          /*
            **メインだけ大きくする。** ヘッダーからIDを外したので、
            この行がこの人を名指している唯一の場所になる。ほかの
            アカウントと同じ大きさで並べると、どれが本体か読めない。
          */
          const shape = account.isLogin
            ? 'inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-base'
            : 'inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-sm'

          return (
            <li key={`${account.platform}-${account.username}-${account.server}-${index}`}>
              {account.url ? (
                <a
                  href={account.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`${shape} transition-colors hover:bg-accent`}
                >
                  {label}
                </a>
              ) : (
                <span className={shape}>{label}</span>
              )}
            </li>
          )
        })}
      </ul>

      {/*
        **連絡の取り先を1行にまとめる。** ホームページもメールも
        「この人に届く場所」で、縦に積むと種類ごとの区画に見える。
        メールだけボタンにすると、同じ役のものが2つの姿で並ぶ。
      */}
      {profile.homepageUrls.length > 0 || (viewer && profile.hasEmail) ? (
        <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {profile.homepageUrls.map((url) => (
            <li key={url}>
              {/* 外部サイトは中継ページを挟む。飛び先を先に見せるため */}
              <Link
                href={`/external-link?url=${encodeURIComponent(url)}`}
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                <ExternalLink className="size-4" />
                {url}
              </Link>
            </li>
          ))}

          {/*
            **未ログインには出さない。**「ログインすると見られます」と
            断るより、できない状態を作らない。押すまで取りにいかないのは
            `useUserEmail` の `enabled`（ログイン済みのクローラー対策）。
          */}
          {viewer && profile.hasEmail ? (
            <li>
              {email.data?.email ? (
                <a
                  href={`mailto:${email.data.email}`}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <Mail className="size-4" />
                  {email.data.email}
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => setRevealEmail(true)}
                  disabled={email.isFetching}
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline disabled:opacity-50"
                >
                  <Mail className="size-4" />
                  {email.isFetching ? '読み込んでいます…' : 'メールアドレスを表示'}
                </button>
              )}
            </li>
          ) : null}
        </ul>
      ) : null}

      {profile.bio ? (
        <div className="mt-5">
          <SafeMarkdown>{profile.bio}</SafeMarkdown>
        </div>
      ) : null}

      {profile.organizations.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-sm font-medium text-foreground">所属グループ</h2>
          {/*
            **役割まで出す。** 管理責任者とスタッフではできることが違うので、
            名前だけ並べると誰に頼めばいいのかが分からない
            （グループのページの管理者欄と同じ）。

            **3件までにして残りは畳む。** 掛け持ちしている人だと、
            プロフィールの本文より先にグループの一覧が場所を取る。
            参加者一覧（`ParticipantList`）と同じ「ほか●件を表示」の形。
          */}
          <ul className="mt-2 flex flex-wrap gap-2">
            {visibleOrgs.map((org) => (
              <li key={org.id}>
                <Link
                  href={`/orgs/${org.slug}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-sm transition-colors hover:bg-accent"
                >
                  <span className="text-foreground">{org.name}</span>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {org.role === 'admin' ? '管理責任者' : 'スタッフ'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {hiddenOrgCount > 0 ? (
            <button
              type="button"
              onClick={() => setOrgsOpen((v) => !v)}
              aria-expanded={orgsOpen}
              aria-label={
                orgsOpen ? '所属グループを閉じる' : `残り${hiddenOrgCount}件のグループを表示`
              }
              className="group mt-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {orgsOpen ? '閉じる' : `ほか${hiddenOrgCount}件を表示`}
              <ChevronDown className={`size-3.5 ${orgsOpen ? 'rotate-180' : ''}`} />
            </button>
          ) : null}
        </section>
      ) : null}

      <AttendableTabs
        tab={tab}
        onTabChange={setTab}
        page={page}
        onPageChange={setPage}
        counts={{ events: stats.events, preEvents: stats.preEvents }}
        list={tab === 'events' ? events : preEvents}
        title="主催"
        emptyLabel={{
          events: 'この人が主催しているイベントはまだありません。',
          preEvents: 'この人が主催している日程調整はまだありません。',
        }}
        filter={
          /*
            **所属グループが無ければ出さない。** 切り替えても何も変わらない
            スイッチを置かない。
          */
          profile.organizations.length > 0 ? (
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
              グループ名義を除く
              <ToggleSwitch
                checked={excludeOrgs}
                onCheckedChange={(next) => {
                  setExcludeOrgs(next)
                  // 件数が変わるので、いまのページが無くなることがある
                  setPage(1)
                }}
              />
            </label>
          ) : null
        }
      />

      {/*
        操作列。**大きさは列の中で全部そろえる**（docs/DESIGN_GUIDELINES.md §7）。
        イベントの作成はヘッダーとマイページに入口があるので、ここには置かない。
      */}
      <div className="mt-10 flex flex-wrap items-center gap-2 border-t border-border pt-6">
        {contactUrl ? (
          <Button variant="default" size="sm" asChild>
            <a href={contactUrl} target="_blank" rel="noreferrer">
              <Send className="size-4" />
              連絡する
            </a>
          </Button>
        ) : null}
        <ShareBar title={`${user.displayName}（@${user.username}@${user.server}）`} />
      </div>
    </div>
  )
}
