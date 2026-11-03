'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { AccountDataDto } from '@/app/api/v1/account/data/route'
import type { AccountProfileDto } from '@/app/api/v1/account/profile/route'
import type { ScheduledPostsDto } from '@/app/api/v1/account/scheduled-posts/route'
import type { AccountSessionsDto } from '@/app/api/v1/account/sessions/route'
import { api } from '@/lib/api/client'
import { userKeys } from '@/lib/api/queries/users'
import type { UpdateProfileBody } from '@/schemas/user'

export const accountKeys = {
  sessions: ['account', 'sessions'] as const,
  data: ['account', 'data'] as const,
  scheduledPosts: ['account', 'scheduled-posts'] as const,
  profile: ['account', 'profile'] as const,
}

/** アカウント情報と削除可否。削除画面が見るのはこれだけ */
export function useAccountData() {
  return useQuery({
    queryKey: accountKeys.data,
    queryFn: () => api.get<AccountDataDto>('/api/v1/account/data'),
  })
}

/**
 * アカウントの完全削除。
 *
 * **成否にかかわらず後片付けはしない。** 消えたあとの画面遷移と Cookie の
 * 始末は呼び出し側が持つ（`window` を触るのはフックの仕事ではない）。
 */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => api.delete<{ success: boolean }>('/api/v1/account/delete'),
  })
}

/** ログイン中のセッション一覧 */
export function useAccountSessions() {
  return useQuery({
    queryKey: accountKeys.sessions,
    queryFn: () => api.get<AccountSessionsDto>('/api/v1/account/sessions'),
  })
}

/** セッションを1つ失効させる */
export function useRevokeSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => api.delete<{ revoked: boolean }>(`/api/v1/account/sessions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.sessions })
    },
  })
}

/** この端末以外をすべて失効させる */
export function useRevokeOtherSessions() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.delete<{ revoked: number }>('/api/v1/account/sessions'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.sessions })
    },
  })
}

/** 自分の予約投稿（Mastodon）。**トークンはサーバーから出さない**ので代理で取る */
export function useScheduledPosts() {
  return useQuery({
    queryKey: accountKeys.scheduledPosts,
    queryFn: () => api.get<ScheduledPostsDto>('/api/v1/account/scheduled-posts'),
  })
}

/** 予約投稿を1つ取り消す */
export function useDeleteScheduledPost() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) =>
      api.delete<{ deleted: boolean }>(`/api/v1/account/scheduled-posts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.scheduledPosts })
    },
  })
}

/**
 * 自分のプロフィール（設定画面が編集する値）。
 *
 * **公開プロフィール（`useUserProfile`）とは別の往復。** あちらは公開して
 * よい形に絞った結果で、メールアドレスを含まない。編集画面が2本のDTOを
 * 継ぎ合わせると、片方が欠けても気づけなくなる。
 */
export function useAccountProfile() {
  return useQuery({
    queryKey: accountKeys.profile,
    queryFn: () => api.get<AccountProfileDto>('/api/v1/account/profile'),
  })
}

/**
 * プロフィールの保存（全体の置き換え）。
 *
 * **自分の公開ページのキャッシュも捨てる。** 見てから設定を変えて戻ると、
 * 直したはずの値が古いまま出る。
 */
export function useUpdateAccountProfile(handle: string | null) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: UpdateProfileBody) =>
      api.put<AccountProfileDto>('/api/v1/account/profile', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accountKeys.profile })
      if (handle) queryClient.invalidateQueries({ queryKey: userKeys.profile(handle) })
    },
  })
}
