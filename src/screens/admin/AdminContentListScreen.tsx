'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { Pagination } from '@/components/common/Pagination'
import { useAdminEvents, useAdminPreEvents } from '@/lib/api/queries/admin'
import { formatJstDate, formatJstDateTime } from '@/lib/jst'
import type { AdminEventDto } from '@/app/api/v1/admin/events/route'
import type { AdminPreEventDto } from '@/app/api/v1/admin/pre-events/route'

import {
  ADMIN_PER_PAGE,
  EVENTS_SPEC,
  PRE_EVENTS_SPEC,
  VISIBILITY_OPTIONS,
  splitSort,
} from './admin-list-params'
import {
  AdminFrame,
  CreatorFilterChip,
  Row,
  RowList,
  SearchBox,
  StatusBadge,
  TitleLink,
  Toolbar,
  UserLine,
} from './parts'
import { useListState } from './useListState'
import { useToggleDisabled } from './useToggleDisabled'

type Kind = 'event' | 'pre-event'
type Item = (AdminEventDto & { kind: 'event' }) | (AdminPreEventDto & { kind: 'pre-event' })

const COPY = {
  event: { title: 'イベント', path: '/events' },
  'pre-event': { title: '日程調整', path: '/pre-events' },
} as const

/** 普段と違う状態だけを札にする（公開中には付けない） */
function Badges({ item }: { item: Item }) {
  return (
    <>
      {item.isDisabled ? <StatusBadge tone="emphasis">無効化</StatusBadge> : null}
      {item.kind === 'event' && item.status === 'cancelled' ? <StatusBadge>中止</StatusBadge> : null}
      {!item.isPublic ? <StatusBadge>非公開</StatusBadge> : null}
    </>
  )
}

function ItemRow({
  item,
  onToggle,
  pending,
}: {
  item: Item
  onToggle: () => void
  pending: boolean
}) {
  return (
    <Row
      title={<TitleLink href={`${COPY[item.kind].path}/${item.id}`}>{item.title}</TitleLink>}
      badges={<Badges item={item} />}
      action={
        /*
          **無効化は destructive、有効化は default。** 戻す操作まで赤いと、
          赤が「取り返しがつかない」を意味しなくなる。
        */
        <Button
          variant={item.isDisabled ? 'default' : 'destructive'}
          size="sm"
          disabled={pending}
          onClick={onToggle}
        >
          {item.isDisabled ? '有効化する' : '無効化する'}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-1">
        <UserLine user={item.creator} size="xs" />
        {item.organization ? (
          <TitleLink href={`/orgs/${item.organization.slug}`}>
            <span className="text-sm text-muted-foreground">{item.organization.name}</span>
          </TitleLink>
        ) : null}
      </div>
      <p className="pt-1">
        {item.kind === 'event' ? `開催 ${formatJstDate(item.startDate)} ・ ` : ''}
        {item.kind === 'event' ? '参加' : '回答'} {item.participantCount}人 ・ 作成{' '}
        {formatJstDateTime(item.createdAt)}
      </p>
    </Row>
  )
}

/**
 * 管理画面のイベント／日程調整の一覧。
 *
 * **2つを同じ画面で描く。** 違いは「開催日があるか」と「参加か回答か」
 * だけで、絞り込みも操作も同じ。別々に書いた旧画面は、片方だけ検索が
 * あり、片方だけ5ページ目以降へ行けなかった。
 *
 * どちらのフックも毎回呼ぶ（呼ぶ順を変えない）。使わない側は `enabled` で止める。
 */
export default function AdminContentListScreen({ kind }: { kind: Kind }) {
  const spec = kind === 'event' ? EVENTS_SPEC : PRE_EVENTS_SPEC
  const [state, navigate] = useListState(spec as typeof EVENTS_SPEC)
  const { sortBy, sortOrder } = splitSort(state.sort)

  const params = {
    search: state.q || undefined,
    status: state.status,
    sortBy,
    sortOrder,
    creatorId: state.creatorId || undefined,
    page: state.page,
    perPage: ADMIN_PER_PAGE,
  }
  const events = useAdminEvents(params, { enabled: kind === 'event' })
  const preEvents = useAdminPreEvents(params, { enabled: kind === 'pre-event' })

  const query = kind === 'event' ? events : preEvents
  const items: Item[] =
    kind === 'event'
      ? (events.data?.items ?? []).map((e) => ({ ...e, kind: 'event' as const }))
      : (preEvents.data?.items ?? []).map((e) => ({ ...e, kind: 'pre-event' as const }))

  const { toggle, pendingId } = useToggleDisabled()
  const noun = COPY[kind].title

  return (
    <AdminFrame title={noun} error={query.error}>
      <Toolbar total={query.data?.meta.total}>
        <SearchBox
          value={state.q}
          onSubmit={(q) => navigate({ q })}
          label={`${noun}を検索`}
          placeholder="題名・主催者の名前"
        />
        <SegmentedControl
          aria-label="公開状態"
          value={state.status}
          onValueChange={(status) => navigate({ status })}
          options={[...VISIBILITY_OPTIONS]}
        />
        <Select value={state.sort} onValueChange={(sort) => navigate({ sort: sort as typeof state.sort })}>
          <SelectTrigger aria-label="並び順" className="h-11 w-48 px-3">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {spec.sort.options?.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.creatorId ? (
          <CreatorFilterChip
            name={items[0]?.creator.displayName ?? null}
            onClear={() => navigate({ creatorId: '' })}
          />
        ) : null}
      </Toolbar>

      <RowList isPending={query.isPending} error={query.error} empty={items.length === 0}>
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            pending={pendingId === item.id}
            onToggle={() => void toggle(item)}
          />
        ))}
      </RowList>

      {query.data ? (
        <Pagination
          page={state.page}
          totalPages={query.data.meta.totalPages}
          onPageChange={(page) => navigate({ page })}
        />
      ) : null}
    </AdminFrame>
  )
}
