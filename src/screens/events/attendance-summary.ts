import type { AttendStatus, AttendanceRowDto, FeeStatus } from '@/server/serializers/event'

/**
 * 出欠登録の集計と絞り込み。
 *
 * **画面の中で数えない。** 当日その場で見る数字なので、
 * 「まだ記録していない人が何人いるか」を間違えると受付が止まる。
 * 記録は押すたびに変わるので、サーバーではなくここで数える。
 */

export type AttendanceSummary = {
  /** 記録の対象になっている人数（キャンセルを除いた参加者） */
  total: number
  present: number
  absent: number
  /** まだ記録していない人。**受付が終わったかどうかはこれで分かる** */
  notEntered: number
  paid: number
  unpaid: number
}

export function summarize(rows: AttendanceRowDto[]): AttendanceSummary {
  const summary: AttendanceSummary = {
    total: rows.length,
    present: 0,
    absent: 0,
    notEntered: 0,
    paid: 0,
    unpaid: 0,
  }

  for (const row of rows) {
    if (row.attendStatus === 'present') summary.present += 1
    else if (row.attendStatus === 'absent') summary.absent += 1
    else summary.notEntered += 1

    if (row.feeStatus === 'paid') summary.paid += 1
    else if (row.feeStatus === 'unpaid') summary.unpaid += 1
  }
  return summary
}

/**
 * 絞り込みの条件。**`all` は「絞らない」**で、状態のひとつではない。
 */
export type AttendanceFilter = {
  /** 名前・ユーザー名・サーバーを部分一致で探す */
  query: string
  attend: AttendStatus | 'all'
  fee: FeeStatus | 'all'
}

export const NO_FILTER: AttendanceFilter = { query: '', attend: 'all', fee: 'all' }

export function isFiltering(filter: AttendanceFilter): boolean {
  return Boolean(filter.query.trim()) || filter.attend !== 'all' || filter.fee !== 'all'
}

/**
 * 絞り込む。
 *
 * **名前は表示名でもユーザー名でも引けるようにする。** 受付では名乗られた
 * 名前と画面の表示名が一致しないことがある（表示名を変えている人、
 * ハンドルで名乗る人）。大文字小文字は区別しない。
 *
 * 条件は**すべてを満たすもの**を残す（「未記録」かつ「未払」など）。
 * 集金が合わないときに探す用途があるので、2つの軸を組み合わせられる。
 */
export function filterRows(
  rows: AttendanceRowDto[],
  filter: AttendanceFilter
): AttendanceRowDto[] {
  const needle = filter.query.trim().toLowerCase()

  return rows.filter((row) => {
    if (filter.attend !== 'all' && row.attendStatus !== filter.attend) return false
    if (filter.fee !== 'all' && row.feeStatus !== filter.fee) return false
    if (!needle) return true

    const haystack = [row.user.displayName, row.user.username, row.user.server]
      .join(' ')
      .toLowerCase()
    return haystack.includes(needle)
  })
}

/**
 * 受付の並び。**まだ記録していない人を上に出す。**
 * 当日やることは「まだの人を減らす」ことなので、済んだ人が上にいると
 * 毎回そこを読み飛ばすことになる。同じ状態の中では元の順（回答順）を保つ。
 */
export function byUnenteredFirst(a: AttendanceRowDto, b: AttendanceRowDto): number {
  const rank = (row: AttendanceRowDto) => (row.attendStatus === 'not_entered' ? 0 : 1)
  return rank(a) - rank(b)
}
