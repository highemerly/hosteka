'use client'

import { Pagination } from '@/components/common/Pagination'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAdminOrgs } from '@/lib/api/queries/admin'
import { formatJstDateTime } from '@/lib/jst'

import { ADMIN_PER_PAGE, ORGS_SPEC, splitSort } from './admin-list-params'
import {
  AdminFrame,
  CreatorFilterChip,
  Row,
  RowList,
  SearchBox,
  TitleLink,
  Toolbar,
  UserLine,
} from './parts'
import { useListState } from './useListState'

/**
 * グループ。**見るだけで、操作は置かない**（旧画面と同じ）。
 * グループを止める手段はまだ無い。中のイベント・日程調整は
 * それぞれの一覧から無効化できる。
 */
export default function AdminOrgsScreen() {
  const [state, navigate] = useListState(ORGS_SPEC)
  const { sortBy, sortOrder } = splitSort(state.sort)

  const { data, isPending, error } = useAdminOrgs({
    search: state.q || undefined,
    sortBy,
    sortOrder,
    creatorId: state.creatorId || undefined,
    page: state.page,
    perPage: ADMIN_PER_PAGE,
  })
  const items = data?.items ?? []

  return (
    <AdminFrame title="グループ" error={error}>
      <Toolbar total={data?.meta.total}>
        <SearchBox
          value={state.q}
          onSubmit={(q) => navigate({ q })}
          label="グループを検索"
          placeholder="名前・ID・作成者の名前"
        />
        <Select value={state.sort} onValueChange={(sort) => navigate({ sort: sort as typeof state.sort })}>
          <SelectTrigger aria-label="並び順" className="h-11 w-48 px-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORGS_SPEC.sort.options?.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.creatorId ? (
          <CreatorFilterChip
            name={items[0]?.creator?.displayName ?? null}
            onClear={() => navigate({ creatorId: '' })}
          />
        ) : null}
      </Toolbar>

      <RowList isPending={isPending} error={error} empty={items.length === 0}>
        {items.map((org) => (
          <Row key={org.id} title={<TitleLink href={`/orgs/${org.slug}`}>{org.name}</TitleLink>}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
              {org.creator ? (
                <UserLine user={org.creator} size="xs" />
              ) : (
                <span>作成者は退会済み</span>
              )}
              <span className="font-mono text-xs">@{org.slug}</span>
            </div>
            <p className="pt-1">
              管理者 {org.adminCount}人 ・ イベント {org.eventCount}件 ・ 日程調整 {org.preEventCount}件 ・ 作成{' '}
              {formatJstDateTime(org.createdAt)}
            </p>
          </Row>
        ))}
      </RowList>

      {data ? (
        <Pagination
          page={state.page}
          totalPages={data.meta.totalPages}
          onPageChange={(page) => navigate({ page })}
        />
      ) : null}
    </AdminFrame>
  )
}
