import type { EventDetailDto } from '@/server/serializers/event'
import type { EventFormValues } from '@/schemas/event'

/**
 * 保存済みのイベントを、フォームの入力欄の形へ写す。
 *
 * **画面の中に書かない。** ここが1つでも欠けると、編集して保存した
 * 瞬間にその項目が消える（サーバーは受け取った本文で全体を上書きする）。
 * 画面の `reset()` の中にあると、抜けても画面は正常に見えるし、
 * テストからも触れない。
 *
 * 往復（開いて保存しただけで値が変わらないこと）は
 * `edit-round-trip.test.ts` が固定している。
 */

/** ISO 文字列を `<input type="date">` の値（JST の日付）にする */
export function toDateInput(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(iso))
}

/** ISO 文字列を `<input type="time">` の値（JST の時刻）にする */
export function toTimeInput(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/** フォームの空欄。作成時の初期値でもある */
export const EMPTY_EVENT_FORM: EventFormValues = {
  title: '',
  description: '',
  hashtags: [],
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  location: '',
  fee: '',
  relatedUrl: '',
  terms: '',
  maxParticipants: null,
  registrationDeadlineDate: '',
  registrationDeadlineTime: '',
  isAllowedForFediverse: true,
  isAllowedForDiscord: false,
  isAllowedForTwitter: false,
  allowedFediverseServers: [],
  isPublic: true,
  isHighlighted: true,
  allowMaybe: false,
  allowParticipationRequest: true,
  organizationId: '',
  optionGroups: [],
}

export function toEventFormValues(event: EventDetailDto): EventFormValues {
  return {
    ...EMPTY_EVENT_FORM,
    title: event.title,
    description: event.description ?? '',
    hashtags: event.hashtags,
    /*
      **時刻は「持っているか」の印を見てから読む。** 日付列と時刻列が
      別々に保存されていて、時刻を持たないイベントは 00:00 が入っている。
      印を見ずに読むと、時刻なしのイベントに 00:00 が付いてしまう。
    */
    startDate: toDateInput(event.startDate),
    startTime: event.hasStartTime ? toTimeInput(event.startDate) : '',
    endDate: event.endDate ? toDateInput(event.endDate) : '',
    endTime: event.endDate && event.hasEndTime ? toTimeInput(event.endDate) : '',
    location: event.location ?? '',
    fee: event.fee ?? '',
    /*
      関連URLの欄は廃止した（場所の欄がURLも受ける）。
      **値は運んだままにする。** 画面から消えたからといって編集のたびに
      消すと、まだデータを移していないイベントのURLが失われる。
      DBの列と一緒に片付けるときにここも消す。
    */
    relatedUrl: event.relatedUrl ?? '',
    terms: event.terms ?? '',
    maxParticipants: event.maxParticipants,
    registrationDeadlineDate: event.registrationDeadline
      ? toDateInput(event.registrationDeadline)
      : '',
    registrationDeadlineTime: event.registrationDeadline
      ? toTimeInput(event.registrationDeadline)
      : '',
    isAllowedForFediverse: event.isAllowedForFediverse,
    isAllowedForDiscord: event.isAllowedForDiscord,
    isAllowedForTwitter: event.isAllowedForTwitter,
    allowedFediverseServers: event.allowedServers.map((s) => s.server),
    isPublic: event.isPublic,
    isHighlighted: event.isHighlighted,
    allowMaybe: event.allowMaybe,
    allowParticipationRequest: event.allowParticipationRequest,
    organizationId: event.organization?.id ?? '',
    optionGroups: event.optionGroups.map((g) => ({
      title: g.title,
      responseType: g.responseType,
      options: g.options.map((o) => ({ name: o.name, maxParticipants: o.maxParticipants })),
    })),
  }
}
