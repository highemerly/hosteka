'use client'

import { useQuery } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { EventListItemDto } from '@/server/serializers/event'
import type { OrgDto } from '@/server/serializers/org'
import type { PreEventListItemDto } from '@/server/serializers/pre-event'
import type { PublicUserDto } from '@/server/serializers/user'

/**
 * グループ詳細。**イベントと日程調整は一覧カードと同じ DTO** なので、
 * `AttendableCard` にそのまま渡せる。
 */
/**
 * グループ詳細。
 *
 * **イベントと日程調整の一覧は入っていない**（`useOrgEvents` /
 * `useOrgPreEvents` がページ送りつきで取る）。件数は一覧と同じ条件で
 * 数えたもの。
 */
export type OrgDetailDto = OrgDto & {
  creator: PublicUserDto | null
  preEventCount: number
  /** のべ参加者数（参加・未定） */
  participantCount: number
}

/** グループのページが1ページに並べる件数 */
export const ORG_LIST_PER_PAGE = 12

export const orgKeys = {
  all: ['orgs'] as const,
  mine: () => ['orgs', 'mine'] as const,
  detail: (slug: string) => ['orgs', 'detail', slug] as const,
  events: (slug: string, page: number) => ['orgs', 'events', slug, page] as const,
  preEvents: (slug: string, page: number) => ['orgs', 'pre-events', slug, page] as const,
}

function listQuery(page: number) {
  return new URLSearchParams({
    page: String(page),
    perPage: String(ORG_LIST_PER_PAGE),
  }).toString()
}

/**
 * 自分が管理しているグループ。
 *
 * 未ログインでは 401 になるので、必要な画面から `enabled` で制御する。
 * 一覧そのものは機密ではないが、呼ぶだけで401を出すとサインインへ
 * 飛ばす処理が働いてしまう。
 */
export function useMyOrgs(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: orgKeys.mine(),
    queryFn: () => api.get<OrgDto[]>('/api/v1/orgs'),
    enabled: options?.enabled ?? true,
    // グループは滅多に増えない
    staleTime: 5 * 60_000,
  })
}

/** グループ詳細。未ログインでも読める（公開ページ） */
export function useOrg(slug: string) {
  return useQuery({
    queryKey: orgKeys.detail(slug),
    queryFn: () => api.get<OrgDetailDto>(`/api/v1/orgs/${encodeURIComponent(slug)}`),
  })
}

/** グループのイベント。開いていないタブは取りにいかない */
export function useOrgEvents(slug: string, page: number, options: { enabled: boolean }) {
  return useQuery({
    queryKey: orgKeys.events(slug, page),
    queryFn: () =>
      api.list<EventListItemDto>(`/api/v1/orgs/${encodeURIComponent(slug)}/events?${listQuery(page)}`),
    enabled: options.enabled,
    placeholderData: (previous) => previous,
  })
}

export function useOrgPreEvents(slug: string, page: number, options: { enabled: boolean }) {
  return useQuery({
    queryKey: orgKeys.preEvents(slug, page),
    queryFn: () =>
      api.list<PreEventListItemDto>(
        `/api/v1/orgs/${encodeURIComponent(slug)}/pre-events?${listQuery(page)}`
      ),
    enabled: options.enabled,
    placeholderData: (previous) => previous,
  })
}
