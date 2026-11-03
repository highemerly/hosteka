/**
 * 参加登録の締切まわりの表示ロジック。
 *
 * 残り時間は描画のたびに変わるので、計算を純関数にして
 * 「いつ」を引数で受ける。テストできるようにするため。
 */

/** 締切までの残りを日本語にする。過ぎていれば「締切済み」 */
export function formatRemaining(deadlineIso: string, nowMs: number): string {
  const diff = new Date(deadlineIso).getTime() - nowMs
  if (Number.isNaN(diff)) return ''
  if (diff <= 0) return '締切済み'

  const days = Math.floor(diff / 86_400_000)
  const hours = Math.floor((diff % 86_400_000) / 3_600_000)
  return days > 0 ? `あと${days}日${hours}時間` : `あと${hours}時間`
}

/** 締切が近いとみなす日数。一覧のカードで急かす閾値 */
export const DEADLINE_SOON_DAYS = 7

export function isDeadlineSoon(deadlineIso: string, nowMs: number): boolean {
  const diff = new Date(deadlineIso).getTime() - nowMs
  if (Number.isNaN(diff)) return false
  return diff > 0 && diff <= DEADLINE_SOON_DAYS * 86_400_000
}

/**
 * 残席が少ないか。定員の2割を切ったら少ないとみなす。
 * 数字だけを出しても切迫感は伝わらない。
 */
export function isScarce(remaining: number | null, capacity: number | null): boolean {
  if (remaining == null || capacity == null || capacity <= 0) return false
  return remaining <= capacity * 0.2
}

/**
 * カードの隅に出す一言。
 *
 * **常に何か出すことはしない。** 全カードに文字が並ぶと、本当に急ぐものが
 * 埋もれる。残席が少ない、または締切が近いときだけ返す。
 */
export function cardUrgency(
  input: { deadline: string | null; remaining: number | null; capacity: number | null },
  nowMs: number
): string | null {
  if (isScarce(input.remaining, input.capacity)) {
    return `残り${Math.max(input.remaining ?? 0, 0)}人`
  }
  if (input.deadline && isDeadlineSoon(input.deadline, nowMs)) {
    return `回答締切 ${formatRemaining(input.deadline, nowMs)}`
  }
  return null
}
