const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * 締切までの残り時間の表示。
 *
 * **24時間を切ったら分まで出す。** 以前は日が無くなると時間だけになり、
 * 1時間を切ると「あと0時間」になっていた。締め切り間際ほど刻みが要る。
 *
 * 分は切り上げる。切り捨てると最後の1分が「あと0時間0分」になり、
 * まだ受け付けているのに締め切ったように読める。
 */
export function formatRemaining(diffMs: number): string {
  if (diffMs <= 0) return '締切済み'
  if (diffMs < DAY) {
    const totalMinutes = Math.ceil(diffMs / MINUTE)
    return `あと${Math.floor(totalMinutes / 60)}時間${totalMinutes % 60}分`
  }
  const days = Math.floor(diffMs / DAY)
  const hours = Math.floor((diffMs % DAY) / HOUR)
  return `あと${days}日${hours}時間`
}
