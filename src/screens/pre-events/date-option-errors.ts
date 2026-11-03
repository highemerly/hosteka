/**
 * 候補日のエラーを、欄の並びに合わせて平らにする。
 *
 * react-hook-form は配列のエラーを入れ子で持つ（`dateOptions[2].startDate`）。
 * **画面はそれを行ごとに出したい** — 何行目が悪いのか分からないまま
 * 「候補日を確認してください」とだけ言われても、30行あれば探せない。
 *
 * 配列そのものへのエラー（重複・件数）と、行ごとのエラーの両方が同時に
 * 起きうるので、まとめて返す。
 */

type ErrorNode = { message?: string } | undefined

type DateOptionErrorNode =
  | (ErrorNode & {
      root?: ErrorNode
    })
  | (ErrorNode & { message?: string })[]
  | undefined

export type DateOptionErrors = {
  /** 欄全体に出す文言。エラーのまとめにも使う */
  message?: string
  /** 行番号 → 文言 */
  rows: Record<number, string>
}

/** 行の中で最初に見つかったエラー。どれか1つ出れば直せる */
function rowMessage(row: unknown): string | undefined {
  if (!row || typeof row !== 'object') return undefined
  const fields = row as Record<string, { message?: string } | undefined>
  for (const key of ['startDate', 'startTime', 'endDate', 'endTime', 'root']) {
    const message = fields[key]?.message
    if (message) return message
  }
  return (row as { message?: string }).message
}

export function flattenDateOptionErrors(errors: {
  dateOptions?: DateOptionErrorNode
}): DateOptionErrors {
  const node = errors.dateOptions
  if (!node) return { rows: {} }

  if (!Array.isArray(node)) return { message: node.message, rows: {} }

  const rows: Record<number, string> = {}
  node.forEach((row, i) => {
    const message = rowMessage(row)
    if (message) rows[i] = message
  })

  /*
    配列に付いたエラーは、要素のエラーと同居すると `root` に入る。
    どちらも無ければ、行のエラーがあることだけを上に出す
    — 上のまとめに何も出ないと、どこが悪いのか分からないまま止まる。
  */
  const own =
    (node as { root?: { message?: string } }).root?.message ??
    (node as { message?: string }).message

  return {
    message: own ?? (Object.keys(rows).length > 0 ? '候補日の入力を確かめてください' : undefined),
    rows,
  }
}
