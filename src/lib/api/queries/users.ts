'use client'

import { useQuery } from '@tanstack/react-query'

import type { UserProfileDto } from '@/app/api/v1/users/[handle]/route'
import type { UserEmailDto } from '@/app/api/v1/users/[handle]/email/route'
import { api } from '@/lib/api/client'
import type { ProfileListScope } from '@/schemas/user'
import type { EventListItemDto } from '@/server/serializers/event'
import type { PreEventListItemDto } from '@/server/serializers/pre-event'

/** ユーザーのページが1ページに並べる件数 */
export const USER_LIST_PER_PAGE = 12

export const userKeys = {
  all: ['users'] as const,
  profile: (handle: string) => ['users', 'profile', handle] as const,
  email: (handle: string) => ['users', 'email', handle] as const,
  events: (handle: string, scope: ProfileListScope, page: number) =>
    ['users', 'events', handle, scope, page] as const,
  preEvents: (handle: string, scope: ProfileListScope, page: number) =>
    ['users', 'pre-events', handle, scope, page] as const,
}

function listQuery(scope: ProfileListScope, page: number) {
  return new URLSearchParams({
    scope,
    page: String(page),
    perPage: String(USER_LIST_PER_PAGE),
  }).toString()
}

/** ユーザーのページ。未ログインでも読める（公開ページ） */
export function useUserProfile(handle: string) {
  return useQuery({
    queryKey: userKeys.profile(handle),
    queryFn: () => api.get<UserProfileDto>(`/api/v1/users/${encodeURIComponent(handle)}`),
  })
}

/**
 * 連絡先のメールアドレス。
 *
 * **押されるまで取りにいかない**（`enabled`）。ページを開いただけで応答に
 * 載せてしまうと、ログイン済みのクローラーが一覧を舐めるだけで集められる。
 * 押した人の数だけ取りにいく形にしておく。
 */
export function useUserEmail(handle: string, options: { enabled: boolean }) {
  return useQuery({
    queryKey: userKeys.email(handle),
    queryFn: () => api.get<UserEmailDto>(`/api/v1/users/${encodeURIComponent(handle)}/email`),
    enabled: options.enabled,
    staleTime: 5 * 60_000,
  })
}

/**
 * その人が主催しているイベント。
 *
 * **詳細（`useUserProfile`）とは別の往復。** 詳細に先頭20件だけ詰めて
 * 返すと、2ページ目から別の経路になり、条件がずれても気づけない。
 *
 * 開いていないタブは取りにいかない（`enabled`）。
 */
export function useUserEvents(
  handle: string,
  scope: ProfileListScope,
  page: number,
  options: { enabled: boolean }
) {
  return useQuery({
    queryKey: userKeys.events(handle, scope, page),
    queryFn: () =>
      api.list<EventListItemDto>(`/api/v1/users/${encodeURIComponent(handle)}/events?${listQuery(scope, page)}`),
    enabled: options.enabled,
    // ページを戻したときに前の結果を出したまま次を取りにいく
    placeholderData: (previous) => previous,
  })
}

export function useUserPreEvents(
  handle: string,
  scope: ProfileListScope,
  page: number,
  options: { enabled: boolean }
) {
  return useQuery({
    queryKey: userKeys.preEvents(handle, scope, page),
    queryFn: () =>
      api.list<PreEventListItemDto>(
        `/api/v1/users/${encodeURIComponent(handle)}/pre-events?${listQuery(scope, page)}`
      ),
    enabled: options.enabled,
    placeholderData: (previous) => previous,
  })
}
