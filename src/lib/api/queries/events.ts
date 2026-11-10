'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api/client'
import type { HashtagScope } from '@/schemas/hashtag'
import type { EventSectionsDto } from '@/app/api/v1/events/sections/route'
import type {
  EventFormOutput,
  MyEventsQuery,
  ParticipantActionBody,
} from '@/schemas/event'
import type { ParticipantAdminAction } from '@/lib/status-transition'
import type {
  AttendanceDto,
  AttendanceRowDto,
  EventContactDto,
  EventDetailDto,
  EventListItemDto,
  ManageParticipantsDto,
} from '@/server/serializers/event'

/**
 * イベント関連のクエリ。
 *
 * キーは配列の先頭を種別、以降を絞り込みにする。
 * 更新後の無効化を `['events']` でまとめて行えるようにするため。
 */
export const eventKeys = {
  all: ['events'] as const,
  detail: (id: string) => ['events', 'detail', id] as const,
  sections: () => ['events', 'sections'] as const,
  hashtag: (tag: string, scope: string, page: number, perPage: number) =>
    ['events', 'hashtag', tag, scope, page, perPage] as const,
  mine: (params: MyEventsParams) => ['events', 'mine', params] as const,
}

/**
 * 一覧の全セクション。**1リクエストで全部取る。**
 * 旧一覧はセクションごとに逐次で叩いていて、往復の積み上がりが
 * モバイルでの体感の遅さの主因になっていた。
 *
 * 絞り込みの引数は持たない。何を出すかはサーバーが決める
 * （まだ参加登録していないイベントだけ）。
 */
export function useEventSections() {
  return useQuery({
    queryKey: eventKeys.sections(),
    queryFn: () => api.get<EventSectionsDto>('/api/v1/events/sections'),
  })
}

export function useEvent(id: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: eventKeys.detail(id),
    queryFn: () => api.get<EventDetailDto>(`/api/v1/events/${id}`),
    enabled: options?.enabled ?? true,
  })
}

/**
 * 作成・更新。
 *
 * 送る形は eventFormSchema の出力そのまま。**画面で組み直さない** —
 * 組み直すと、スキーマを直したときに送信側だけ古いままになる。
 */
export function useCreateEvent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: EventFormOutput) =>
      api.post<{ id: string }>('/api/v1/events', input),
    onSuccess: () => {
      // 一覧のどのセクションに出るかはサーバーが決めるので、まとめて捨てる
      queryClient.invalidateQueries({ queryKey: eventKeys.all })
    },
  })
}

export function useUpdateEvent(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: EventFormOutput) => api.put(`/api/v1/events/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: eventKeys.all })
    },
  })
}

/** ハッシュタグのページの、イベントを出す切り替え */
export type HashtagEventScope = Exclude<HashtagScope, 'pre-events'>

/**
 * ハッシュタグ別のイベント一覧。タブとページで引数が変わる。
 * `enabled` が偽なら引かない（「日程調整中」を開いているとき）
 */
export function useHashtagEvents(
  tag: string,
  scope: HashtagEventScope,
  page: number,
  perPage: number,
  enabled = true
) {
  return useQuery({
    enabled,
    queryKey: eventKeys.hashtag(tag, scope, page, perPage),
    queryFn: () =>
      api.list<EventListItemDto>(
        `/api/v1/events/hashtag/${encodeURIComponent(tag)}?scope=${scope}&page=${page}&perPage=${perPage}`
      ),
    // タブやページを切り替えたときに一瞬空へ落とさない
    placeholderData: (prev) => prev,
  })
}

export type ParticipateInput = {
  status: 'attending' | 'maybe' | 'not_attending' | 'participation_request' | 'cancelled'
  comment?: string
  selectedGroupOptions?: Record<string, string[]>
  /** 自由入力の回答。`{ グループID: 本文 }` */
  groupTextAnswers?: Record<string, string>
  /** 参加規約があるイベントでは必須。無いイベントでは送らない */
  termsAccepted?: boolean
}

/**
 * 参加登録・変更。
 *
 * 新規は POST、既存の記録があれば PUT。**「表示上は未参加」ではなく
 * 「記録があるか」で決める。** 一度キャンセルすると status は
 * cancelled になるが行は残るので、POST では再登録できない。
 */
export function useParticipate(eventId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      input,
      isUpdate,
    }: {
      input: ParticipateInput
      isUpdate: boolean
    }) =>
      isUpdate
        ? api.put(`/api/v1/events/${eventId}/participate`, input)
        : api.post(`/api/v1/events/${eventId}/participate`, input),
    onSuccess: () => {
      // 参加状態が変わると参加者一覧・残席・自分の状態がすべて変わる。
      // 部分更新せず詳細ごと取り直す
      queryClient.invalidateQueries({ queryKey: eventKeys.detail(eventId) })
    },
  })
}

/** 自分のイベント一覧の絞り込み。URL のクエリ文字列とそのまま対応する */
export type MyEventsParams = Pick<
  MyEventsQuery,
  'role' | 'scope' | 'status' | 'page' | 'perPage'
>

/**
 * 自分に紐づくイベント（`/dashboard/my-events`）。
 *
 * 絞り込みはすべてキーに入れる。条件を変えるたびに別のクエリとして
 * 扱われるので、戻ったときに前の結果がそのまま出る。
 */
export function useMyEvents(params: MyEventsParams) {
  return useQuery({
    queryKey: eventKeys.mine(params),
    queryFn: () => {
      const search = new URLSearchParams({
        role: params.role,
        scope: params.scope,
        status: params.status,
        page: String(params.page),
        perPage: String(params.perPage),
      })
      return api.list<EventListItemDto>(`/api/v1/events/mine?${search.toString()}`)
    },
    // 絞り込みを戻したときに前の結果を出したまま次を取りに行く
    placeholderData: (previous) => previous,
  })
}

// =============================================================================
// 参加者への連絡
// =============================================================================

/** 連絡画面に要るもの。宛先と自分の投稿手段をまとめて1往復で取る */
export function useEventContact(id: string) {
  return useQuery({
    queryKey: [...eventKeys.detail(id), 'contact'] as const,
    queryFn: () => api.get<EventContactDto>(`/api/v1/events/${id}/contact`),
  })
}

export type PostEventMessageInput = {
  /**
   * 投稿する本文。**分割が要るときは複数入る。**
   * メンションが多いと1投稿に収まらないため（`lib/message-splitter.ts`）。
   */
  posts: string[]
  visibility: string
  /** 予約投稿の日時（JST の ISO 文字列）。無ければ即時 */
  scheduledFor?: string
  /** 宛先。API が件数を数えるのに使う */
  recipientIds: string[]
}

/**
 * Hosteka から直接投稿する。
 *
 * **分割は順番に送る。** 並行にすると相手のサーバーで順序が入れ替わり、
 * 「(2/3)」が先に流れる。途中で失敗したら**そこで止める** — 残りを
 * 送り続けると、抜けた番号のある投稿列ができる。
 */
export function usePostEventMessage(id: string) {
  return useMutation<{ sent: number }, Error, PostEventMessageInput>({
    mutationFn: async ({ posts, visibility, scheduledFor, recipientIds }) => {
      const path = scheduledFor
        ? '/api/v1/events/post-scheduled'
        : '/api/v1/events/post-immediate'

      let sent = 0
      for (const message of posts) {
        try {
          await api.post(path, {
            eventId: id,
            message,
            visibility,
            participantIds: recipientIds,
            ...(scheduledFor && { scheduledFor }),
          })
        } catch (e) {
          // 何件送れたところで失敗したのかを画面へ伝える
          if (sent > 0 && e instanceof Error) {
            e.message = `${sent}/${posts.length}件を送ったところで失敗しました。${e.message}`
          }
          throw e
        }
        sent += 1
      }
      return { sent }
    },
  })
}

// =============================================================================
// 参加者の管理
// =============================================================================

/** 参加者を編集する画面に要るもの。オプションのIDまで含む */
export function useManageParticipants(id: string) {
  return useQuery({
    queryKey: [...eventKeys.detail(id), 'manage-participants'] as const,
    queryFn: () => api.get<ManageParticipantsDto>(`/api/v1/events/${id}/manage-participants`),
  })
}

/**
 * 参加者の編集画面の操作。**その場で反映する**（まとめて保存しない）。
 * 本文の形は**スキーマから取る** — 手で書き写すと、名前が変わったときに
 * 型では気づけず、送ってから分かることになる（実際そうなった）。
 */
export function useParticipantAction(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ userId, action }: { userId: string; action: ParticipantAdminAction }) =>
      action === 'delete'
        ? api.delete(`/api/v1/events/${id}/participants/${userId}`)
        : api.patch(`/api/v1/events/${id}/participants/${userId}`, {
            action,
          } satisfies ParticipantActionBody),
    /*
      **失敗しても取り直す。** 409 は「他の操作で状態が変わっていた」なので、
      古い画面のまま押し直させない。参加者の数も一覧の見え方も変わる。
    */
    onSettled: () => queryClient.invalidateQueries({ queryKey: eventKeys.all }),
  })
}

// =============================================================================
// 出欠登録（当日の記録）
// =============================================================================

export function useAttendance(id: string) {
  return useQuery({
    queryKey: [...eventKeys.detail(id), 'attendance'] as const,
    queryFn: () => api.get<AttendanceDto>(`/api/v1/events/${id}/attendance`),
  })
}

export type SaveAttendanceInput = {
  userId: string
  attendStatus?: AttendanceRowDto['attendStatus']
  feeStatus?: AttendanceRowDto['feeStatus']
  memo?: string | null
}

/**
 * 出欠を1人ぶん記録する。
 *
 * **押した瞬間に送る。** 当日その場で使う画面なので、「保存」を押し忘れた
 * まま閉じると記録が消える。溜めない代わりに、画面は押した瞬間に見た目を
 * 変え、返ってきた値で確定させる。
 *
 * **一覧を取り直さない。** 受付の最中に並び順が変わると、いま触っている
 * 行が動いてしまう。返ってきた1行だけを差し替える。
 */
export function useSaveAttendance(id: string) {
  const queryClient = useQueryClient()
  const key = [...eventKeys.detail(id), 'attendance'] as const

  return useMutation({
    mutationFn: (input: SaveAttendanceInput) =>
      api.post<{
        userId: string
        attendStatus: string
        feeStatus: string
        memo: string | null
      }>(`/api/v1/events/${id}/attendance`, input),
    onSuccess: (saved) => {
      queryClient.setQueryData<AttendanceDto>(key, (prev) =>
        prev
          ? {
              ...prev,
              rows: prev.rows.map((row) =>
                row.userId === saved.userId
                  ? {
                      ...row,
                      attendStatus: saved.attendStatus as AttendanceRowDto['attendStatus'],
                      feeStatus: saved.feeStatus as AttendanceRowDto['feeStatus'],
                      memo: saved.memo,
                    }
                  : row
              ),
            }
          : prev
      )
    },
  })
}

/**
 * イベントを中止する。
 *
 * **取り消せない。** 参加者の記録は残るが、`status` は戻せない
 * （元に戻す API が無い）。呼ぶ前に必ず確かめること。
 */
export function useCancelEvent(id: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => api.post(`/api/v1/events/${id}/cancel`, {}),
    onSuccess: () => {
      // 一覧の出方も詳細の操作も変わる。まとめて取り直す
      queryClient.invalidateQueries({ queryKey: eventKeys.all })
    },
  })
}
