/**
 * イベントの日時の組み立て。**日付列と時刻列から本物の瞬間を作る場所はここだけ。**
 *
 * 開催日時と締切は、日付（`startDate` など）と時刻（`"HH:MM"` の文字列）の
 * **2列で保存されている**。以前はこの組み立てをシリアライザ・参加登録・
 * 自動キャンセル・一覧の絞り込み・カレンダー出力がそれぞれ書いていて、
 * 結果が食い違っていた:
 *
 * - 参加登録と自動キャンセルは UTC の日付で読み、旧形式の行を**1日早く**締め切った
 * - 一覧は `setHours(23, 59)` をサーバーのローカル時刻でやり、本番（UTC）で
 *   **9時間遅く**締め切った
 * - カレンダー出力は時刻列を読まず、どのイベントも 09:00 開始になった
 *
 * 画面に出る締切と、実際に締め切られる時刻が別々の式から出ていたことになる。
 */

/**
 * その瞬間が JST で何月何日かを `YYYY-MM-DD` で返す。
 *
 * **UTC の日付を使ってはならない。** 日付列には2つの保存形式が混ざっている。
 *   旧: 入力欄の値をブラウザのローカル時刻で解釈したもの
 *       （JST なら `2026-09-12T00:00` → `2026-09-11T15:00Z`）
 *   新: 日付文字列をそのまま `new Date('2026-09-12')` にしたもの（UTC 0時）
 * UTC で読むと旧形式が1日前にずれる。JST で読めば両方とも同じ日になる。
 */
export function jstDay(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date)
}

/**
 * 時刻列の値。**`HH:MM` でなければ無かったことにする。**
 *
 * この列は文字列で、古いデータには `9:00`（0詰めなし）のような値が
 * 入りうる。そのまま日時に組むと `Invalid Date` になり、
 * `toISOString()` が RangeError を投げて**API が 500 になる。**
 * 時刻が読めないことは、詳細ページ全体が開けない理由にはならない。
 */
function safeTime(time: string | null): string | null {
  return time && /^\d{2}:\d{2}$/.test(time) ? time : null
}

/**
 * 日付列と時刻列を1つの瞬間にまとめる。**JST 固定**。
 *
 * 新フォームは日付だけを送るので `startDate` は UTC 0時になり、
 * 片方だけ読むと「19:00 と入力したのに詳細で 09:00 と表示される」状態に
 * なっていた（編集で開き直すと 09:00 が入力欄に流し込まれ、保存するたびにずれた）。
 *
 * 旧データのように `startDate` へ時刻まで入っている場合も、JST の日付だけを
 * 取り出して時刻列と合成するので同じ結果になる。
 */
export function eventDateTimeAt(date: Date, time: string | null, hasTime: boolean): Date {
  const at = hasTime ? safeTime(time) : null
  return new Date(`${jstDay(date)}T${at ?? '00:00'}:00+09:00`)
}

/** `eventDateTimeAt` の ISO 文字列版。DTO に載せる形 */
export function composeDateTime(date: Date, time: string | null, hasTime: boolean): string {
  return eventDateTimeAt(date, time, hasTime).toISOString()
}

/**
 * イベントが終わる瞬間。終了日時、無ければ開始日時。
 *
 * **詳細画面の「終了しました」と同じ規則**（あちらは DTO の
 * `endDate ?? startDate` を見ていて、DTO は `composeDateTime` が作る）。
 * サーバーで別の式を持つと、画面では受付中なのに一覧の絞り込みからは
 * 消えている、が起きる。
 */
export function eventEndAt(event: {
  startDate: Date
  startTime: string | null
  hasStartTime: boolean
  endDate: Date | null
  endTime: string | null
  hasEndTime: boolean
}): Date {
  return event.endDate
    ? eventDateTimeAt(event.endDate, event.endTime, event.hasEndTime)
    : eventDateTimeAt(event.startDate, event.startTime, event.hasStartTime)
}

/**
 * 締切の時刻を入れなかったときの時刻。**その日いっぱい受け付ける。**
 * イベントと日程調整の両方がこれを使う（日程調整は 0:00 だったので、
 * 日付だけ入れるとその日になった瞬間に締め切られていた）。
 */
export const DEADLINE_DEFAULT_TIME = '23:59'

/**
 * 締切日と締切時刻を1つの瞬間にまとめる。
 * 時刻未設定なら `DEADLINE_DEFAULT_TIME` とみなす。**JST 固定**。
 * サーバーのタイムゾーンに依存させると、日本時間の23:59でない時刻に締め切られる。
 */
export function eventDeadlineAt(date: Date | null, time: string | null): Date | null {
  if (!date) return null
  return new Date(`${jstDay(date)}T${safeTime(time) ?? DEADLINE_DEFAULT_TIME}:00+09:00`)
}

/**
 * 締切の時刻を指定したか。`eventDeadlineAt` が時刻列を使うかどうかと同じ判定。
 * **`has*Time` 列は見ない** — あちらは `00:00` を「指定なし」にするが、
 * 締切の時刻列は `00:00` のまま保存され、0時に締め切られる。
 */
export function hasDeadlineTime(time: string | null): boolean {
  return safeTime(time) !== null
}

/** `eventDeadlineAt` の ISO 文字列版。DTO に載せる形 */
export function composeDeadline(date: Date | null, time: string | null): string | null {
  return eventDeadlineAt(date, time)?.toISOString() ?? null
}
