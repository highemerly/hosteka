/**
 * 可変長の欄のエラーを、行の並びに合わせて平らにする。
 *
 * react-hook-form は配列のエラーを入れ子で持つ（`socialAccounts[2].server`）。
 * **画面はそれを行ごとに出したい** — 何行目が悪いのか分からないまま
 * 「SNSの入力を確かめてください」とだけ言われても、5行あれば探せない。
 *
 * 配列そのものへのエラー（件数）と行ごとのエラーが同時に起きうるので、
 * まとめて返す（`src/screens/pre-events/date-option-errors.ts` と同じ形）。
 */

type ErrorNode = { message?: string } | undefined

export type RowErrors = {
  /** 欄全体に出す文言 */
  message?: string
  /** 行番号 → 文言 */
  rows: Record<number, string>
}

/*
  配列の要素は、欄ごとのエラー（`{ server: { message } }`）にも
  要素そのもののエラー（`{ message }`）にもなる。**要素は `unknown` で受ける** —
  react-hook-form の入れ子を型で写し取ろうとすると、欄が増えるたびに
  ここを直すことになるが、読むのは `firstMessage` だけで済む。
*/
type ArrayErrorNode = (ErrorNode & { root?: ErrorNode }) | unknown[] | undefined

/** 行の中で最初に見つかったエラー。どれか1つ出れば直せる */
function firstMessage(row: unknown, keys: readonly string[]): string | undefined {
  if (!row || typeof row !== 'object') return undefined
  const fields = row as Record<string, { message?: string } | undefined>
  for (const key of keys) {
    const message = fields[key]?.message
    if (message) return message
  }
  return (row as { message?: string }).message
}

function flatten(
  node: ArrayErrorNode,
  keys: readonly string[],
  fallback: string
): RowErrors {
  if (!node) return { rows: {} }
  if (!Array.isArray(node)) return { message: node.message, rows: {} }

  const rows: Record<number, string> = {}
  node.forEach((row, i) => {
    const message = firstMessage(row, keys)
    if (message) rows[i] = message
  })

  /*
    配列に付いたエラーは、要素のエラーと同居すると `root` に入る。
    どちらも無ければ、行にエラーがあることだけを上に出す — 上のまとめに
    何も出ないと、どこが悪いのか分からないまま止まる。
  */
  const own =
    (node as { root?: { message?: string } }).root?.message ??
    (node as { message?: string }).message

  return {
    message: own ?? (Object.keys(rows).length > 0 ? fallback : undefined),
    rows,
  }
}

export function flattenSocialAccountErrors(errors: {
  socialAccounts?: ArrayErrorNode
}): RowErrors {
  return flatten(
    errors.socialAccounts,
    ['platform', 'username', 'server', 'root'],
    'SNSの入力を確かめてください'
  )
}

export function flattenHomepageUrlErrors(errors: {
  homepageUrls?: ArrayErrorNode
}): RowErrors {
  return flatten(errors.homepageUrls, ['root'], 'ホームページの入力を確かめてください')
}
