'use client'

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { AnnouncementBody } from '@/schemas/announcement'
import type { AnnouncementDto } from '@/server/serializers/announcement'

/**
 * 運営からのお知らせの取得と操作。
 *
 * キーの先頭は種別、以降は用途（`queries/events.ts` と同じ規約）。
 * 管理側の書き込みのあとは `announcementKeys.all` をまとめて捨てる —
 * 1件直すと、管理の一覧も公開の一覧もバナーも同時に変わる。
 */
export const announcementKeys = {
  all: ['announcements'] as const,
  published: (placement: string) => ['announcements', 'published', placement] as const,
  detail: (id: string) => ['announcements', 'detail', id] as const,
  admin: (query: string) => ['announcements', 'admin', query] as const,
}

/** 公開中のお知らせ（一覧画面） */
export function useAnnouncements() {
  return useQuery({
    queryKey: announcementKeys.published('list'),
    queryFn: () => api.list<AnnouncementDto>('/api/v1/announcements'),
  })
}

/**
 * バナーに出ているお知らせ。
 *
 * **全ページのヘッダー下から呼ばれる。** 画面遷移のたびに取り直さないよう
 * 長めに持つ（掲載の判定はサーバーがするので、こちらが古くても
 * ずれるのはせいぜい数分）。
 */
export function useBannerAnnouncements() {
  return useQuery({
    queryKey: announcementKeys.published('banner'),
    queryFn: () => api.list<AnnouncementDto>('/api/v1/announcements?placement=banner'),
    staleTime: 5 * 60_000,
  })
}

/** お知らせ1件。本文の無いものと公開前のものは 404 になる */
export function useAnnouncement(id: string) {
  return useQuery({
    queryKey: announcementKeys.detail(id),
    queryFn: () => api.get<AnnouncementDto>(`/api/v1/announcements/${encodeURIComponent(id)}`),
  })
}

/** 管理側の一覧。予約中のものと掲載の終わったものも入る */
export function useAdminAnnouncements(params: { page: number; perPage: number }) {
  const query = new URLSearchParams({
    page: String(params.page),
    perPage: String(params.perPage),
  }).toString()

  return useQuery({
    queryKey: announcementKeys.admin(query),
    queryFn: () => api.list<AnnouncementDto>(`/api/v1/admin/announcements?${query}`),
    placeholderData: keepPreviousData,
  })
}

/** 作成と更新。**同じ本文の形を送る**（更新は全体の上書き） */
export function useSaveAnnouncement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, body }: { id: number | null; body: AnnouncementBody }) =>
      id
        ? api.put<AnnouncementDto>(`/api/v1/admin/announcements/${encodeURIComponent(id)}`, body)
        : api.post<AnnouncementDto>('/api/v1/admin/announcements', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: announcementKeys.all }),
  })
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ success: true }>(`/api/v1/admin/announcements/${encodeURIComponent(id)}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: announcementKeys.all }),
  })
}
