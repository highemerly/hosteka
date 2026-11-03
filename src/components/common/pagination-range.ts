/**
 * ページ送りに出すページ番号の並び。
 *
 * 全ページを並べると、100ページあるときに100個のリンクが出る。
 * 端と現在地の周りだけを残し、間は省略記号にする。
 *
 * **出す個数は常に同じにする。** 端に寄ったときだけ短くなると、
 * ページを送るたびにボタンの位置が動いて押し間違える。
 * 省略した側の分は反対側を伸ばして埋める。
 *
 * 幅が変わると入る個数も変わるので `siblings`（現在地の左右に何個出すか）
 * を引数にする。モバイルは 0、PC は 1。
 */
export type PageItem = number | 'gap'

function sequence(from: number, to: number): number[] {
  return Array.from({ length: Math.max(to - from + 1, 0) }, (_, i) => from + i)
}

export function pageRange(current: number, total: number, siblings = 1): PageItem[] {
  if (total <= 0) return []
  if (total === 1) return [1]

  // 先頭 + 省略 + 現在地の周り + 省略 + 末尾
  const window = siblings * 2 + 5
  if (total <= window) return sequence(1, total)

  const left = Math.max(current - siblings, 1)
  const right = Math.min(current + siblings, total)
  const needLeftGap = left > 2
  const needRightGap = right < total - 1
  /** 端に寄ったときに、片側へまとめて出す個数 */
  const edgeCount = window - 2

  let items: PageItem[]
  if (!needLeftGap && needRightGap) {
    items = [...sequence(1, edgeCount), 'gap', total]
  } else if (needLeftGap && !needRightGap) {
    items = [1, 'gap', ...sequence(total - edgeCount + 1, total)]
  } else {
    items = [1, 'gap', ...sequence(left, right), 'gap', total]
  }

  /*
    省略記号が1ページしか隠していないなら、そのページを出す。
    「…」を押しても開けないのに、その先が1件しかないのは損。
    個数は変わらないので幅も動かない。
  */
  return items.map((item, i) => {
    if (item !== 'gap') return item
    const before = items[i - 1]
    const after = items[i + 1]
    if (typeof before === 'number' && typeof after === 'number' && after - before === 2) {
      return before + 1
    }
    return item
  })
}
