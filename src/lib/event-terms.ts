/**
 * 参加規約を変えられるか。**画面とサーバーで同じ規則を使う。**
 *
 * 規約は参加登録の前に同意を求めるもの（`events/[id]/participate`）。
 * 後から書き換えると、**同意していない内容に同意したことになっている人**が
 * できる。だから登録した人が1人でもいれば変えられない。
 *
 * 逆に、まだ誰も登録していないイベントは自由に直せる。以前は
 * 「一度保存したら二度と変えられない」だったので、作成直後の誤字ですら
 * 直せずイベントを作り直すことになっていた。**日程調整も同じ**
 * （`canEditPreEventTerms`）。
 *
 * この判定は画面（欄を読み取り専用にする）とサーバー（書き込みを拒む）の
 * 両方が要る。**片方だけにすると必ずずれる** — 画面だけなら API を直接
 * 叩けば通り、サーバーだけなら書き換えたつもりで保存されない。
 */

/**
 * 「登録した人」と数える状態。
 *
 * 参加・未定・参加リクエストの3つ。どれも**これから参加しうる**立場なので、
 * 同意した規約が後から変わっては困る。
 *
 * **欠席とキャンセルは数えない。** どちらも規約に縛られる立場ではないし、
 * 数えると「一度キャンセルが出たら永久に直せない」ことになる。
 */
export const TERMS_LOCKING_STATUSES = ['attending', 'maybe', 'participation_request'] as const

/**
 * 参加規約を編集できるか。
 *
 * @param participantStatuses イベントの参加記録の状態。**全件渡すこと** —
 *   絞った側で状態を選ぶと、ここが数える範囲と食い違う
 */
export function canEditEventTerms(participantStatuses: readonly string[]): boolean {
  const locking: readonly string[] = TERMS_LOCKING_STATUSES
  return !participantStatuses.some((status) => locking.includes(status))
}

/**
 * 日程調整の参加規約を編集できるか。**イベントと同じ考え方で、数え方だけ違う。**
 *
 * 数えるのは**回答した人の実人数**。日程調整は「1人につき候補日の数だけ行」を
 * 持つので、行で数えると候補が多いだけで人がいるように見える。
 *
 * 状態で選り分けない（イベントの `TERMS_LOCKING_STATUSES` にあたるものが無い）。
 * 回答は候補日ごとに○△×が混ざるので「規約に縛られない立場」を1人単位で
 * 決められないし、×だけを付けた人も規約を読んだうえで答えている。
 *
 * @param respondentCount 回答した人の実人数
 */
export function canEditPreEventTerms(respondentCount: number): boolean {
  return respondentCount === 0
}

/**
 * 参加規約の変更を通してよいか。**削除だけは登録した人がいても通す。**
 *
 * 足す・書き換えるは、同意していない内容に同意したことになっている人を
 * 作るので `canEditEventTerms` に従う。一方で**削除は主催者が自分の求めを
 * 取り下げること**で、それによって不利になる参加者はいない。
 *
 * 削除できないと、規約を消したいだけの主催者にはイベントを作り直す以外の
 * 道が無くなる（参加記録ごと消えるので、消したいものの代償が大きすぎる）。
 *
 * **戻す道は無い。** 消したあとは足せないので、画面は確認を挟むこと。
 *
 * @param participantStatuses イベントの参加記録の状態。**全件渡すこと**
 * @param change `from` は保存済みの値、`to` はこれから保存する値。
 *   どちらも空文字ではなく `null` に寄せてから渡す
 */
export function isAllowedEventTermsChange(
  participantStatuses: readonly string[],
  change: { from: string | null; to: string | null }
): boolean {
  if (change.from === change.to) return true
  if (change.to === null) return true
  return canEditEventTerms(participantStatuses)
}

/**
 * 日程調整の参加規約の変更を通してよいか。
 * **イベント（`isAllowedEventTermsChange`）と同じ考え方で、数え方だけ違う。**
 *
 * @param respondentCount 回答した人の実人数
 * @param change `from` は保存済みの値、`to` はこれから保存する値
 */
export function isAllowedPreEventTermsChange(
  respondentCount: number,
  change: { from: string | null; to: string | null }
): boolean {
  if (change.from === change.to) return true
  if (change.to === null) return true
  return canEditPreEventTerms(respondentCount)
}
