/**
 * 「約3日前にアクティブ」。ログイン中の端末（`/account/sessions`）の最終利用。
 *
 * **日時ではなく、どれくらい前かで書く。** 人が見たいのは「身に覚えのない
 * 端末が最近使われたか」で、時刻そのものではない。
 *
 * **1時間より細かくは言わない。** 記録（`sessions.lastUsedAt`）は最大
 * 1時間に1回しか進まない（`server/auth/session-activity.ts`）。
 * 「約5分前」と出しても、その精度は持っていない。
 *
 * `now` はサーバーの時刻を渡す。端末の時計と比べると、ずれている人に
 * だけ違う数字が出る。
 */

const HOUR_MS = 60 * 60_000
const DAY_MS = 24 * HOUR_MS
/** 月は30日で数える。「約」と付けて出すので、暦の月に合わせる意味が無い */
const MONTH_MS = 30 * DAY_MS

export function formatLastActive(lastUsedAt: string | Date, now: string | Date): string {
  // 時計のずれで未来になっても「0より前」にはしない
  const elapsed = Math.max(0, new Date(now).getTime() - new Date(lastUsedAt).getTime())

  if (elapsed < HOUR_MS) return '1時間以内にアクティブ'
  if (elapsed < DAY_MS) return `約${Math.floor(elapsed / HOUR_MS)}時間前にアクティブ`
  if (elapsed < MONTH_MS) return `約${Math.floor(elapsed / DAY_MS)}日前にアクティブ`
  return `約${Math.floor(elapsed / MONTH_MS)}ヶ月前にアクティブ`
}
