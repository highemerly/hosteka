import { addDays } from '@/components/attendable/fields/date-grid'
import type { DateOptionDraft } from '@/components/attendable/fields/date-option'
import { DEADLINE_DEFAULT_TIME } from '@/lib/event-datetime'
import type { PreEventFormOutput } from '@/schemas/pre-event'

/**
 * フォームの入力を API の本文にする。逆（保存済みの日時を欄へ戻す）も。
 *
 * **日付と時刻を JST の1つの日時にまとめるのはここだけ。**
 * イベント側では、フォームが日付だけを送るようになったのに
 * シリアライザが日付列しか見ておらず、19:00 が 09:00 になる事故が起きた。
 * 同じ形の計算なので、
 * 画面から切り離してテストで固定する。
 *
 * 日程調整では往復も正確でなければならない。**保存 → 読み戻し → 保存で
 * 1分でもずれると、その候補日の回答が黙って消える** — サーバーは候補日を
 * 作り直したうえで、開始・終了が完全に一致する日へ回答を移すため
 * （`api/v1/pre-events/[id]` の PUT）。
 */

/** `YYYY-MM-DD` と `HH:MM` を JST の日時にする。時刻が無ければ 00:00 */
export function composeJst(date: string, time?: string): string {
  return new Date(`${date}T${time || '00:00'}:00+09:00`).toISOString()
}

/** ISO 文字列を JST の `YYYY-MM-DD` にする */
export function toJstDate(iso: string): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date(iso))
}

/** ISO 文字列を JST の `HH:MM` にする */
export function toJstTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

/**
 * 候補日の終了日。
 *
 * **終了時刻が開始より前なら翌日とみなす。** 22:00–02:00 のような候補を
 * 「終了日」の欄なしで書けるようにする（欄を足すと、ほとんどの候補で
 * 空のまま残る）。日をまたぐ以外の複数日にわたる候補は、既存の値を
 * `endDate` に持ったまま運ぶ。
 */
function resolveEndDate(option: DateOptionDraft): string | undefined {
  if (option.endDate) return option.endDate
  if (!option.endTime) return undefined
  if (option.startTime && option.endTime < option.startTime) return addDays(option.startDate, 1)
  return option.startDate
}

export type PreEventPayload = {
  title: string
  description?: string
  hashtags: string[]
  location?: string
  fee?: string
  terms?: string
  /** 画面に欄は無い。運ぶだけ（`schemas/pre-event.ts` の説明を参照） */
  relatedUrl?: string
  dateOptions: { startDate: string; endDate: string | null }[]
  registrationDeadline: string | null
  isAllowedForFediverse: boolean
  isAllowedForDiscord: boolean
  isAllowedForTwitter: boolean
  allowedFediverseServers: string[]
  allowAutoRegistration: boolean
  isPublic: boolean
  isHighlighted: boolean
  organizationId?: string
}

export function toPreEventPayload(values: PreEventFormOutput): PreEventPayload {
  return {
    title: values.title,
    description: values.description,
    hashtags: values.hashtags,
    location: values.location,
    fee: values.fee,
    terms: values.terms,
    relatedUrl: values.relatedUrl,
    dateOptions: values.dateOptions.map((option) => {
      /*
        終了は「終了日があればその日、無ければ開始日（日をまたぐなら翌日）」に
        終了時刻を付ける。**終了時刻だけ指定されている場合を落とさない** —
        同じ日の 19:00–21:00 が最も多い形なので、ここで捨てると時刻が消える。
      */
      const endDate = resolveEndDate(option)
      return {
        startDate: composeJst(option.startDate, option.startTime),
        endDate: endDate ? composeJst(endDate, option.endTime) : null,
      }
    }),
    // 時刻が無ければその日いっぱい（イベントと同じ。候補日の 00:00 とは違う）
    registrationDeadline: values.registrationDeadlineDate
      ? composeJst(
          values.registrationDeadlineDate,
          values.registrationDeadlineTime || DEADLINE_DEFAULT_TIME
        )
      : null,
    isAllowedForFediverse: values.isAllowedForFediverse,
    isAllowedForDiscord: values.isAllowedForDiscord,
    isAllowedForTwitter: values.isAllowedForTwitter,
    allowedFediverseServers: values.allowedFediverseServers,
    allowAutoRegistration: values.allowAutoRegistration,
    isPublic: values.isPublic,
    isHighlighted: values.isHighlighted,
    organizationId: values.organizationId || undefined,
  }
}

/**
 * 保存済みの候補日を入力欄の形へ戻す。`toPreEventPayload` の逆。
 *
 * **時刻を持たない候補は 00:00 で保存されている**（列が日時1つしかない）。
 * 読み戻すときは時刻なしとして扱う。0時ちょうどの候補を立てた人は
 * 時刻が消えたように見えるが、送り直しても同じ 00:00 になるので
 * 保存された値はずれない。
 */
export function toDateOptionDraft(option: {
  startDate: string
  endDate: string | null
}): DateOptionDraft {
  const startDate = toJstDate(option.startDate)
  const rawStartTime = toJstTime(option.startDate)
  const startTime = rawStartTime === '00:00' ? undefined : rawStartTime

  if (!option.endDate) return { startDate, startTime }

  const endDate = toJstDate(option.endDate)
  const endTime = toJstTime(option.endDate)

  if (endDate === startDate) {
    /*
      同じ日の 0 時に終わる候補は「終了なし」と見分けが付かない。
      **`endDate` を明示して運ぶ** — 落とすと保存し直したときに
      終了が null になり、回答の移し先が消える。
    */
    if (endTime === '00:00') return { startDate, startTime, endDate }
    return { startDate, startTime, endTime }
  }

  // 日をまたぐだけなら `resolveEndDate` が翌日を組み直せる。欄には出さない
  if (endDate === addDays(startDate, 1) && startTime && endTime < startTime) {
    return { startDate, startTime, endTime }
  }

  /*
    複数日にわたる候補。

    **0時ちょうどの終了は「終了時刻なし」として戻す。** 時刻を決めずに
    9/12–9/14 を候補にすると 9/14 の 0 時で保存されるが、それをそのまま
    `endTime: '00:00'` として戻すと、開始時刻が無いまま終了時刻だけ持つ
    候補になり、**保存の検証（終了時刻だけの指定はできません）で弾かれる**
    — 開いて保存するだけで落ちる。送り直しても同じ 0 時になるので、
    落としても保存される値はずれない。
  */
  if (endTime === '00:00') return { startDate, startTime, endDate }
  return { startDate, startTime, endDate, endTime }
}
