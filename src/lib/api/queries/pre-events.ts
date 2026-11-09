'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import { eventKeys } from '@/lib/api/queries/events'
import type { PreEventSectionsDto } from '@/app/api/v1/pre-events/sections/route'
import type {
  PreEventContactDto,
  PreEventDetailDto,
  PreEventVote,
} from '@/server/serializers/pre-event'
import type { PreEventPayload } from '@/screens/pre-events/pre-event-payload'
import type { MyPreEventsQuery } from '@/schemas/pre-event'
import type { EventFormOutput } from '@/schemas/event'
import type { PreEventListItemDto } from '@/server/serializers/pre-event'

/**
 * 日程調整のクエリ。
 * キーはイベント側（`eventKeys`）と同じ組み立て方にしてある。
 */
export const preEventKeys = {
  all: ['pre-events'] as const,
  detail: (id: string) => ['pre-events', 'detail', id] as const,
  sections: () => ['pre-events', 'sections'] as const,
  mine: (params: MyPreEventsParams) => ['pre-events', 'mine', params] as const,
}

export type MyPreEventsParams = Pick<MyPreEventsQuery, 'role' | 'scope' | 'page' | 'perPage'>

/** 自分の日程調整一覧（`/dashboard/my-pre-events`）。イベント側と同じ形 */
export function useMyPreEvents(params: MyPreEventsParams) {
  return useQuery({
    queryKey: preEventKeys.mine(params),
    queryFn: () => {
      const search = new URLSearchParams({
        role: params.role,
        scope: params.scope,
        page: String(params.page),
        perPage: String(params.perPage),
      })
      return api.list<PreEventListItemDto>(`/api/v1/pre-events/mine?${search.toString()}`)
    },
    // 絞り込みを戻したときに前の結果を出したまま次を取りに行く
    placeholderData: (previous) => previous,
  })
}

export function usePreEvent(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: preEventKeys.detail(id),
    queryFn: () => api.get<PreEventDetailDto>(`/api/v1/pre-events/${id}`),
    enabled: options?.enabled ?? true,
  })
}

/** 一覧の全セクション。**1リクエストで全部取る** */
export function usePreEventSections() {
  return useQuery({
    queryKey: preEventKeys.sections(),
    queryFn: () => api.get<PreEventSectionsDto>('/api/v1/pre-events/sections'),
  })
}

export function useCreatePreEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: PreEventPayload) =>
      api.post<{ id: string }>('/api/v1/pre-events', input),
    onSuccess: () => {
      // どのセクションに出るかはサーバーが決めるので、まとめて捨てる
      queryClient.invalidateQueries({ queryKey: preEventKeys.all })
    },
  })
}

/**
 * 日程調整を候補日の1つでイベントにする。
 *
 * イベントの一覧にも日程調整の一覧にも出入りがあるので、両方を捨てる。
 */
export function usePromotePreEvent(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: { dateOptionId: string; event: EventFormOutput }) =>
      api.post<{ id: string; registeredCount: number }>(`/api/v1/pre-events/${id}/promote`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: preEventKeys.all })
      queryClient.invalidateQueries({ queryKey: eventKeys.all })
    },
  })
}

export function useUpdatePreEvent(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: PreEventPayload) => api.put(`/api/v1/pre-events/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: preEventKeys.all })
    },
  })
}

/**
 * 日程調整を消す。**回答も一緒に消える**（DB の cascade）。
 * 呼ぶ前に必ず確かめること。取り消せない。
 */
export function useDeletePreEvent(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.delete(`/api/v1/pre-events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: preEventKeys.all })
    },
  })
}

export type RespondInput = {
  /** 候補日ごとの回答。**全部の候補日を送る** — 送らなかった日の扱いが
      サーバー側で決まってしまい、画面で見えている状態と食い違う */
  responses: { dateOptionId: string; status: PreEventVote }[]
  comment?: string
  autoRegisterWhenPromoted?: boolean
}

/**
 * 日程の回答。
 *
 * 新規も変更も同じ POST。**イベントと違い記録の有無で分けない** —
 * サーバーが候補日ごとに upsert するため。
 */
export function useRespondPreEvent(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: RespondInput) =>
      api.post(`/api/v1/pre-events/${id}/participate`, input),
    onSuccess: () => {
      // 集計も自分の回答もまとめて変わる。部分更新せず取り直す
      queryClient.invalidateQueries({ queryKey: preEventKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: preEventKeys.sections() })
    },
  })
}

// =============================================================================
// 回答者への連絡
// =============================================================================

/** 連絡画面に要るもの。宛先・自分の投稿手段をまとめて1往復で取る */
export function usePreEventContact(id: string) {
  return useQuery({
    queryKey: [...preEventKeys.detail(id), 'contact'] as const,
    queryFn: () => api.get<PreEventContactDto>(`/api/v1/pre-events/${id}/contact`),
  })
}

export type PostMessageInput = {
  /**
   * 投稿する本文。**分割が要るときは複数入る。**
   * メンションが多いと1投稿に収まらないため（`lib/message-splitter.ts`）。
   */
  posts: string[]
  visibility: string
  /** 予約投稿の日時（JST の ISO 文字列）。無ければ即時 */
  scheduledFor?: string
}

export type PostMessageResult = {
  /** 送れた数。分割の途中で失敗したときに「何件送れたか」を出す */
  sent: number
  total: number
}

/**
 * Hosteka から直接投稿する。
 *
 * **分割は順番に送る。** 並行にすると相手のサーバーで順序が入れ替わり、
 * 「(2/3)」が先に流れる。途中で失敗したら**そこで止める** — 残りを
 * 送り続けると、抜けた番号のある投稿列ができる。
 */
export function usePostPreEventMessage(id: string) {
  return useMutation<PostMessageResult, Error, PostMessageInput>({
    mutationFn: async ({ posts, visibility, scheduledFor }) => {
      const path = scheduledFor
        ? `/api/v1/pre-events/${id}/post-scheduled`
        : `/api/v1/pre-events/${id}/post-immediate`

      let sent = 0
      for (const message of posts) {
        try {
          await api.post(path, { message, visibility, ...(scheduledFor && { scheduledFor }) })
        } catch (e) {
          // 何件送れたところで失敗したのかを画面へ伝える
          if (sent > 0 && e instanceof Error) {
            e.message = `${sent}/${posts.length}件を送ったところで失敗しました。${e.message}`
          }
          throw e
        }
        sent += 1
      }
      return { sent, total: posts.length }
    },
  })
}
