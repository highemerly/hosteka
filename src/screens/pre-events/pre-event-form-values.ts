import { DEADLINE_DEFAULT_TIME } from '@/lib/event-datetime'
import type { PreEventDetailDto } from '@/server/serializers/pre-event'
import type { PreEventFormValues } from '@/schemas/pre-event'

import { toDateOptionDraft, toJstDate, toJstTime } from './pre-event-payload'

/**
 * 保存済みの日程調整を、フォームの入力欄の形へ写す。
 *
 * **画面の中に書かない。** ここが1つでも欠けると、編集して保存した
 * 瞬間にその項目が消える（サーバーは受け取った本文で全体を上書きする）。
 * 画面の `reset()` の中にあると、抜けても画面は正常に見えるし、
 * テストからも触れない。
 *
 * 対になるのは `toPreEventPayload`。**この2つを通した往復で値が
 * 変わらないこと**を `edit-round-trip.test.ts` が固定している。
 */

/**
 * 締切の時刻の欄。**23:59 は空にする**（時刻の欄を出さない）。
 * 日程調整の締切は日時1列で、「時刻を指定しなかった」を持たない。
 * 空で保存すると 23:59 になる（`toPreEventPayload`）ので、往復しても変わらない。
 */
export function deadlineTimeInput(deadline: string | null): string {
  if (!deadline) return ''
  const time = toJstTime(deadline)
  return time === DEADLINE_DEFAULT_TIME ? '' : time
}

/** フォームの空欄。作成時の初期値でもある */
export const EMPTY_PRE_EVENT_FORM: PreEventFormValues = {
  title: '',
  description: '',
  hashtags: [],
  location: '',
  fee: '',
  terms: '',
  relatedUrl: '',
  dateOptions: [],
  registrationDeadlineDate: '',
  registrationDeadlineTime: '',
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: [],
  allowAutoRegistration: false,
  isPublic: true,
  isHighlighted: true,
  organizationId: '',
}

export function toPreEventFormValues(preEvent: PreEventDetailDto): PreEventFormValues {
  return {
    ...EMPTY_PRE_EVENT_FORM,
    title: preEvent.title,
    description: preEvent.description ?? '',
    hashtags: preEvent.hashtags,
    location: preEvent.location ?? '',
    fee: preEvent.fee ?? '',
    terms: preEvent.terms ?? '',
    /*
      関連URLの欄は画面に無い。**値は運んだままにする** — 送らないと
      PUT が null で上書きする（`schemas/pre-event.ts` の説明を参照）。
    */
    relatedUrl: preEvent.relatedUrl ?? '',
    dateOptions: preEvent.dateOptions.map(toDateOptionDraft),
    registrationDeadlineDate: preEvent.registrationDeadline
      ? toJstDate(preEvent.registrationDeadline)
      : '',
    registrationDeadlineTime: deadlineTimeInput(preEvent.registrationDeadline),
    isAllowedForFediverse: preEvent.isAllowedForFediverse,
    isAllowedForDiscord: preEvent.isAllowedForDiscord,
    isAllowedForTwitter: preEvent.isAllowedForTwitter,
    allowedFediverseServers: preEvent.allowedServers.map((s) => s.server),
    allowAutoRegistration: preEvent.allowAutoRegistration,
    isPublic: preEvent.isPublic,
    isHighlighted: preEvent.isHighlighted,
    organizationId: preEvent.organization?.id ?? '',
  }
}
