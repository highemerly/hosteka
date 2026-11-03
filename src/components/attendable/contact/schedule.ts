/**
 * 予約投稿の日時。
 *
 * **JST で扱う**（CLAUDE.md の時刻の方針）。`<input type="datetime-local">`
 * は時間帯を持たない文字列を返すので、送る前に `+09:00` を付ける。
 * 付け忘れると、ブラウザの時間帯で解釈されて9時間ずれる。
 */

/**
 * Mastodon が受け付ける最短の猶予。
 * **これより近い時刻はサーバーが断る**ので、送る前に画面で止める。
 */
export const MIN_LEAD_MINUTES = 10

/** `YYYY-MM-DDTHH:MM`（datetime-local の値）を JST の日時にする */
export function composeScheduledAt(localValue: string): string {
  return `${localValue}:00+09:00`
}

/** 送れない理由。問題なければ null */
export function validateScheduledAt(localValue: string, now = new Date()): string | null {
  if (!localValue) return '予約する日時を選んでください'

  const at = new Date(composeScheduledAt(localValue))
  if (Number.isNaN(at.getTime())) return '日時の形式が正しくありません'

  if (at <= now) return '過去の日時は指定できません'
  if (at.getTime() - now.getTime() < MIN_LEAD_MINUTES * 60 * 1000) {
    return `いまから${MIN_LEAD_MINUTES}分より先の時刻を指定してください`
  }
  return null
}

export type ScheduleSuggestion = { value: string; label: string }

/** JST の `YYYY-MM-DDTHH:MM`。datetime-local へそのまま入れられる形 */
export function toLocalInputValue(date: Date): string {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
  // sv-SE は "2026-12-01 23:59" を返す。datetime-local は T 区切り
  return parts.replace(' ', 'T')
}

/**
 * 「いつ送るか」の候補。
 *
 * **締切の24時間前を出す。** 日程調整のリマインダーはほぼこれで、
 * 自分で日時を組み立てさせると、締切より後に送る設定を作りかねない。
 * 既に24時間を切っているときは出さない（過去は指定できない）。
 */
export function scheduleSuggestions(
  registrationDeadline: string | null,
  now = new Date()
): ScheduleSuggestion[] {
  if (!registrationDeadline) return []

  const deadline = new Date(registrationDeadline)
  const dayBefore = new Date(deadline.getTime() - 24 * 60 * 60 * 1000)
  if (dayBefore.getTime() - now.getTime() < MIN_LEAD_MINUTES * 60 * 1000) return []

  const label = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dayBefore)

  return [{ value: toLocalInputValue(dayBefore), label: `回答締切の24時間前（${label}）` }]
}
