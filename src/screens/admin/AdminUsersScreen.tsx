'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'

import { useConfirm } from '@/components/common/ConfirmDialog'
import { Pagination } from '@/components/common/Pagination'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ApiClientError } from '@/lib/api/client'
import { useAdminUsers, useBannedUsers, useUnbanUser } from '@/lib/api/queries/admin'
import { formatJstDateTime } from '@/lib/jst'
import { findPlatform } from '@/screens/auth/sign-in-platforms'
import type { AdminUserListItemDto } from '@/app/api/v1/admin/users/route'
import type { BannedUserDto } from '@/app/api/v1/admin/users/banned/route'

import { ADMIN_PER_PAGE, USERS_SPEC, splitSort } from './admin-list-params'
import { BanUserDialog, type BanTarget } from './BanUserDialog'
import { AdminFrame, Row, RowList, SearchBox, StatusBadge, Toolbar, UserLine } from './parts'
import { useListState } from './useListState'

/** IP は先頭の3つだけ出す。残りは件数だけ（全部並べると行が縦に伸びる） */
const IP_SHOWN = 3

/**
 * 件数。1件以上なら、その人が主催したものだけの一覧へ飛べる。
 * 0件のリンクは押しても空の一覧なので、文字だけにする。
 */
function CountLink({ href, label, value }: { href: string; label: string; value: number }) {
  if (value === 0) return <span>{label} 0</span>
  return (
    <Link href={href} className="text-foreground underline-offset-4 hover:underline">
      {label} {value}
    </Link>
  )
}

function UserRow({
  user,
  onBan,
  onSearch,
}: {
  user: AdminUserListItemDto
  onBan: () => void
  /** IP を押すと、その IP で検索し直す（同じ IP の別アカウントを探す） */
  onSearch: (term: string) => void
}) {
  const { counts } = user
  const byCreator = `?creatorId=${encodeURIComponent(user.id)}`

  return (
    <Row
      title={<UserLine user={user} size="md" />}
      badges={
        <>
          {user.isAdmin ? <StatusBadge>管理者</StatusBadge> : null}
          {user.bannedAt ? <StatusBadge tone="emphasis">停止中</StatusBadge> : null}
        </>
      }
      action={
        // 管理者と停止中の人には BAN を出さない（どちらもサーバーが断る）。
        // 押せないボタンは置かない。解除は「BAN済み」の側から
        user.isAdmin || user.bannedAt ? null : (
          <Button variant="destructive" size="sm" onClick={onBan}>
            BANする
          </Button>
        )
      }
    >
      <p className="flex flex-wrap gap-x-3 pt-1">
        <span>主催</span>
        <CountLink href={`/admin/events${byCreator}`} label="イベント" value={counts.events} />
        <CountLink href={`/admin/pre-events${byCreator}`} label="日程調整" value={counts.preEvents} />
        <CountLink href={`/admin/orgs${byCreator}`} label="グループ" value={counts.orgs} />
      </p>
      <p className="flex flex-wrap gap-x-3">
        <span>参加</span>
        <span>イベント {counts.eventParticipations}</span>
        <span>日程調整 {counts.preEventResponses}</span>
      </p>
      <p>
        最終ログイン {user.lastLoginAt ? formatJstDateTime(user.lastLoginAt) : 'なし'} ・ 初回ログイン{' '}
        {formatJstDateTime(user.createdAt)} ・ 規約同意{' '}
        {user.lastTermsAcceptedAt ? formatJstDateTime(user.lastTermsAcceptedAt) : 'なし'}
      </p>
      {user.ipAddresses.length > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>IP</span>
          {user.ipAddresses.slice(0, IP_SHOWN).map((ip) => (
            <button
              key={ip}
              type="button"
              onClick={() => onSearch(ip)}
              title="このIPで検索"
              className="rounded-lg font-mono text-xs text-foreground underline-offset-4 hover:underline"
            >
              {ip}
            </button>
          ))}
          {user.ipAddresses.length > IP_SHOWN ? (
            <span className="text-xs">ほか{user.ipAddresses.length - IP_SHOWN}件</span>
          ) : null}
        </p>
      ) : null}
    </Row>
  )
}

function BannedRow({
  item,
  onUnban,
  pending,
}: {
  item: BannedUserDto
  onUnban: () => void
  pending: boolean
}) {
  const platform = findPlatform(item.platform)

  return (
    <Row
      title={
        <span className="inline-flex items-center gap-1.5">
          {/* 表示名があれば出す。無いのは削除方式だった頃の記録 */}
          {item.displayName ? `${item.displayName}（@${item.username}@${item.server}）` : null}
          {item.displayName ? null : `@${item.username}@${item.server}`}
          {platform ? (
            <platform.icon className="size-3.5 text-muted-foreground" aria-label={platform.label} />
          ) : null}
        </span>
      }
      action={
        <Button variant="default" size="sm" disabled={pending} onClick={onUnban}>
          BANを解除
        </Button>
      }
    >
      {item.reason ? (
        <p className="break-words whitespace-pre-wrap text-foreground">{item.reason}</p>
      ) : null}
      <p>
        BAN {formatJstDateTime(item.bannedAt)}
        {item.bannedBy ? ` ・ ${item.bannedBy.displayName}（@${item.bannedBy.username}）` : ''}
      </p>
    </Row>
  )
}

/**
 * ユーザー。「ユーザー」と「BAN済み」を切り替える。
 *
 * **BAN 済みの人もユーザー一覧に居る**（BAN は停止であって削除ではない）。
 * 行には「停止中」の札が出て、BAN のボタンは出ない。解除は「BAN済み」の
 * 側から行う — 理由と、いつ誰が停止したかが並ぶのはあちらだけなので。
 *
 * 検索欄は1つ。`名前@サーバー`、名前、サーバー、IP のどれでも引ける。
 */
export default function AdminUsersScreen() {
  const [state, navigate] = useListState(USERS_SPEC)
  const { sortBy, sortOrder } = splitSort(state.sort)
  const banned = state.view === 'banned'

  const users = useAdminUsers(
    { search: state.q || undefined, sortBy, sortOrder, page: state.page, perPage: ADMIN_PER_PAGE },
    { enabled: !banned }
  )
  const bannedUsers = useBannedUsers(
    { search: state.q || undefined, page: state.page, perPage: ADMIN_PER_PAGE },
    { enabled: banned }
  )
  const query = banned ? bannedUsers : users

  const confirm = useConfirm()
  const unban = useUnbanUser()
  const [banTarget, setBanTarget] = React.useState<BanTarget | null>(null)

  const requestUnban = async (item: BannedUserDto) => {
    const ok = await confirm({
      title: 'BANを解除しますか？',
      description: (
        <>
          <p className="font-medium text-foreground">
            @{item.username}@{item.server}
          </p>
          <p className="mt-2">
            同じアカウントでまたログインできるようになります。BANのときに無効化されたものは、ここでは戻りません。
          </p>
        </>
      ),
      confirmLabel: 'BANを解除',
    })
    if (!ok) return

    unban.mutate(item.id, {
      onSuccess: () => toast.success('BANを解除しました'),
      onError: (e) => toast.error(e instanceof ApiClientError ? e.message : 'BANを解除できませんでした'),
    })
  }

  return (
    <AdminFrame title="ユーザー" error={query.error}>
      <Toolbar total={query.data?.meta.total}>
        <SegmentedControl
          aria-label="表示する一覧"
          value={state.view}
          onValueChange={(view) => navigate({ view })}
          options={[...(USERS_SPEC.view.options ?? [])]}
        />
        <SearchBox
          value={state.q}
          onSubmit={(q) => navigate({ q })}
          label="ユーザーを検索"
          placeholder={banned ? 'alice@example.social' : 'alice@example.social・IPアドレス'}
        />
        {/* BAN 済みは BAN した日の新しい順だけ。並べ替える項目が残っていない */}
        {banned ? null : (
          <Select value={state.sort} onValueChange={(sort) => navigate({ sort: sort as typeof state.sort })}>
            <SelectTrigger aria-label="並び順" className="h-11 w-56 px-3">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {USERS_SPEC.sort.options?.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Toolbar>

      {banned ? (
        <RowList
          isPending={bannedUsers.isPending}
          error={bannedUsers.error}
          empty={(bannedUsers.data?.items.length ?? 0) === 0}
        >
          {bannedUsers.data?.items.map((item) => (
            <BannedRow
              key={item.id}
              item={item}
              pending={unban.isPending && unban.variables === item.id}
              onUnban={() => void requestUnban(item)}
            />
          ))}
        </RowList>
      ) : (
        <RowList
          isPending={users.isPending}
          error={users.error}
          empty={(users.data?.items.length ?? 0) === 0}
        >
          {users.data?.items.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              onSearch={(q) => navigate({ q })}
              onBan={() =>
                setBanTarget({
                  id: user.id,
                  displayName: user.displayName,
                  username: user.username,
                  server: user.server,
                  hosted: { events: user.counts.events, preEvents: user.counts.preEvents },
                })
              }
            />
          ))}
        </RowList>
      )}

      {query.data ? (
        <Pagination
          page={state.page}
          totalPages={query.data.meta.totalPages}
          onPageChange={(page) => navigate({ page })}
        />
      ) : null}

      <BanUserDialog
        target={banTarget}
        open={banTarget !== null}
        onOpenChange={(open) => (open ? undefined : setBanTarget(null))}
      />
    </AdminFrame>
  )
}
