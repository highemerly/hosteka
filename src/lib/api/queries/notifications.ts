'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { NotificationSummaryDto } from '@/app/api/v1/notifications/summary/route'
import { api } from '@/lib/api/client'
import type { NotificationCategory, NotificationKind } from '@/schemas/notification'
import type { NotificationDto } from '@/server/serializers/notification'

/**
 * 通知の読み書き。
 *
 * キーの先頭は種別、以降は絞り込み。更新後の無効化を `['notifications']` で
 * まとめて行えるようにするため（`queries/events.ts` と同じ規約）。
 */
export const notificationKeys = {
  all: ['notifications'] as const,
  summary: ['notifications', 'summary'] as const,
  list: (query: string) => ['notifications', 'list', query] as const,
}

export type NotificationsParams = {
  category: NotificationCategory | 'all'
  kind?: NotificationKind
  page: number
  perPage: number
}

function toQuery(params: NotificationsParams): string {
  const search = new URLSearchParams({
    page: String(params.page),
    perPage: String(params.perPage),
  })
  if (params.category !== 'all') search.set('category', params.category)
  if (params.kind) search.set('kind', params.kind)
  return search.toString()
}

export function useNotifications(params: NotificationsParams) {
  const query = toQuery(params)
  return useQuery({
    queryKey: notificationKeys.list(query),
    queryFn: () => api.list<NotificationDto>(`/api/v1/notifications?${query}`),
    // 絞り込みを戻したときに、前の結果を出したまま次を取りに行く
    placeholderData: (previous) => previous,
  })
}

/**
 * ヘッダーのベル1つ分。
 *
 * **ログインしていなければ叩かない。** 全ページに出るものなので、
 * 匿名の閲覧者が開くたびに401が1本飛ぶことになる。
 */
export function useNotificationSummary(enabled: boolean) {
  return useQuery({
    queryKey: notificationKeys.summary,
    queryFn: () => api.get<NotificationSummaryDto>('/api/v1/notifications/summary'),
    enabled,
  })
}

/**
 * 既読位置を今へ進める。
 *
 * **呼ぶのは「利用者が通知を見にいった瞬間」だけ。** 画面遷移のたびに
 * 呼ぶと既読位置が動き続け、連続編集がまとまらなくなる
 * （まとまるのは「読む前」だけなので）。
 *
 * **成功しても即座に無効化しない。** 読んでいる最中にバッジと強調が
 * 消えると、何が新しかったのかが分からなくなる。無効化は画面側が
 * 「読み終わった」と判断したとき（ポップオーバーを閉じたとき）に行う。
 */
export function useMarkNotificationsSeen() {
  return useMutation({
    mutationFn: () => api.post<{ seenAt: string }>('/api/v1/notifications/seen'),
  })
}

/** 既読位置を進めたあと、未読数と一覧を取り直す */
export function useRefreshNotifications() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: notificationKeys.all })
}
