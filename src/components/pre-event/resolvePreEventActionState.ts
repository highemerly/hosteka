import type { PreEventDetailDto } from '@/server/serializers/pre-event'

/**
 * 回答操作の状態。
 *
 * イベント側（`resolveEventActionState`）と同じ考え方で、画面から
 * 切り離してテストできるようにしてある。**状態はイベントより少ない** —
 * 定員も参加リクエストも無いため。
 */
export type PreEventActionState =
  /** 未ログイン */
  | { kind: 'anonymous' }
  /** 主催者 */
  | { kind: 'host'; answered: boolean }
  /** 未回答・受付中 */
  | { kind: 'open' }
  /** 回答済み */
  | { kind: 'answered' }
  /** 締切を過ぎた */
  | { kind: 'closed'; answered: boolean }
  /** すべての候補日が過ぎた */
  | { kind: 'ended'; answered: boolean }
  /** プラットフォームやサーバーの条件を満たさない */
  | { kind: 'ineligible'; reason: 'platform' | 'server' | null }
  /**
   * イベントになった。もう回答できない。行き先はイベント
   * （`eventId` はイベントが消えていれば null）
   */
  | { kind: 'promoted'; eventId: string | null }

export function resolvePreEventActionState(input: {
  dateOptions: { startDate: string }[]
  registrationDeadline: string | null
  promotion: PreEventDetailDto['promotion']
  viewer: PreEventDetailDto['viewer']
  now?: Date
}): PreEventActionState {
  const now = input.now ?? new Date()
  const { viewer } = input
  const answered = viewer.response !== null

  // 主催者は終了後も内容を見に来る
  if (viewer.isOrganizer) return { kind: 'host', answered }

  /*
    **イベントになったら、ほかの何よりも先に言う。** 締切や終了より前に見る —
    決まった日程調整に来た人が知りたいのは「どこで参加登録するか」で、
    回答できない理由ではない。未ログインの人にも同じものを出す。
  */
  if (input.promotion) return { kind: 'promoted', eventId: input.promotion.eventId }

  /*
    終了の判定は**未来の候補日が1つも無いこと**。日程調整に開催日は
    無いので、候補日で判断する（一覧の絞り込みと同じ規則）。
  */
  const hasFuture = input.dateOptions.some((o) => new Date(o.startDate) >= now)
  if (!hasFuture) return { kind: 'ended', answered }

  if (!viewer.isAuthenticated) return { kind: 'anonymous' }

  // 回答済みでも締切後でも、自分が答えたことは見えなければならない
  if (!viewer.isEligible) return { kind: 'ineligible', reason: viewer.ineligibleReason }

  if (input.registrationDeadline && new Date(input.registrationDeadline) < now) {
    return { kind: 'closed', answered }
  }

  return answered ? { kind: 'answered' } : { kind: 'open' }
}
