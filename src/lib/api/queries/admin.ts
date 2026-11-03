'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AdminEventDto } from '@/app/api/v1/admin/events/route'
import type { AdminOrgDto } from '@/app/api/v1/admin/orgs/route'
import type { AdminOverviewDto } from '@/app/api/v1/admin/overview/route'
import type { AdminPreEventDto } from '@/app/api/v1/admin/pre-events/route'
import type { AdminUserListItemDto } from '@/app/api/v1/admin/users/route'
import type { BannedUserDto } from '@/app/api/v1/admin/users/banned/route'
import { api } from '@/lib/api/client'
import type { ListReportsStatus, UpdateReportBody } from '@/schemas/report'
import type { ReportDetailDto, ReportDto } from '@/server/serializers/report'

/**
 * 管理画面の取得と操作。
 *
 * **操作のあとは管理画面のキャッシュを丸ごと捨てる。** 1件を無効化すると
 * 一覧（公開状態の絞り込み）・トップの件数・その対象への通報の詳細が
 * 同時に変わる。どれとどれが連動するかを操作ごとに書き分けると、
 * 必ず1つ古いまま残る。管理画面は人の手で開くものなので、取り直しは誤差。
 */
export const adminKeys = {
  all: ['admin'] as const,
  overview: () => ['admin', 'overview'] as const,
  list: (resource: string, query: string) => ['admin', resource, query] as const,
  report: (id: string) => ['admin', 'report', id] as const,
}

/** `{ a: 'x', b: undefined }` → `a=x`。空の値は送らない */
function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  return search.toString()
}

type ListOptions = { enabled?: boolean }

function useAdminList<T>(
  resource: string,
  path: string,
  params: Record<string, string | number | undefined>,
  options?: ListOptions
) {
  const query = toQuery(params)
  return useQuery({
    queryKey: adminKeys.list(resource, query),
    queryFn: () => api.list<T>(`${path}?${query}`),
    enabled: options?.enabled ?? true,
    // 絞り込みを変えたときに前の結果を出したまま次を取りに行く
    placeholderData: keepPreviousData,
  })
}

export function useAdminOverview() {
  return useQuery({
    queryKey: adminKeys.overview(),
    queryFn: () => api.get<AdminOverviewDto>('/api/v1/admin/overview'),
  })
}

export function useAdminReports(params: { status: ListReportsStatus; page: number; perPage: number }) {
  return useAdminList<ReportDto>('reports', '/api/v1/admin/reports', params)
}

export function useAdminReport(id: string) {
  return useQuery({
    queryKey: adminKeys.report(id),
    queryFn: () => api.get<ReportDetailDto>(`/api/v1/admin/reports/${encodeURIComponent(id)}`),
  })
}

export function useAdminEvents(params: {
  search?: string
  status: string
  sortBy: string
  sortOrder: string
  creatorId?: string
  page: number
  perPage: number
}, options?: ListOptions) {
  return useAdminList<AdminEventDto>('events', '/api/v1/admin/events', params, options)
}

export function useAdminPreEvents(params: {
  search?: string
  status: string
  sortBy: string
  sortOrder: string
  creatorId?: string
  page: number
  perPage: number
}, options?: ListOptions) {
  return useAdminList<AdminPreEventDto>('pre-events', '/api/v1/admin/pre-events', params, options)
}

export function useAdminUsers(params: {
  search?: string
  sortBy: string
  sortOrder: string
  page: number
  perPage: number
}, options?: ListOptions) {
  return useAdminList<AdminUserListItemDto>('users', '/api/v1/admin/users', params, options)
}

export function useBannedUsers(
  params: { search?: string; page: number; perPage: number },
  options?: ListOptions
) {
  return useAdminList<BannedUserDto>('banned', '/api/v1/admin/users/banned', params, options)
}

export function useAdminOrgs(params: {
  search?: string
  sortBy: string
  sortOrder: string
  creatorId?: string
  page: number
  perPage: number
}) {
  return useAdminList<AdminOrgDto>('orgs', '/api/v1/admin/orgs', params)
}

/** 管理画面の操作。成功したら管理画面のキャッシュを捨てる */
function useAdminMutation<V, R>(fn: (variables: V) => Promise<R>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
  })
}

/** イベント・日程調整の無効化／有効化。**どちらも同じ操作**なので1つにする */
export function useSetDisabled() {
  return useAdminMutation(
    ({ kind, id, isDisabled }: { kind: 'event' | 'pre-event'; id: string; isDisabled: boolean }) =>
      api.patch<{ id: string; isDisabled: boolean }>(
        `/api/v1/admin/${kind === 'event' ? 'events' : 'pre-events'}/${encodeURIComponent(id)}/disable`,
        { isDisabled }
      )
  )
}

export function useBanUser() {
  return useAdminMutation(({ id, reason }: { id: string; reason: string }) =>
    api.post<{ success: boolean }>(`/api/v1/admin/users/${encodeURIComponent(id)}/ban`, { reason })
  )
}

export function useUnbanUser() {
  return useAdminMutation((id: string) =>
    api.post<{ success: boolean }>(`/api/v1/admin/users/banned/${encodeURIComponent(id)}/unban`)
  )
}

export function useUpdateReport(id: string) {
  return useAdminMutation((body: UpdateReportBody) =>
    api.patch<ReportDetailDto>(`/api/v1/admin/reports/${encodeURIComponent(id)}`, body)
  )
}
