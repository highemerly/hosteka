/**
 * 看板の横流しに必要な並びを作る。
 *
 * 流れているものは**同じ並びを3本つないだもの**で、CSS は左へ 33.333%
 * （＝1本分）動かして端で巻き戻す（`globals.css` の `@keyframes marquee`）。
 *
 * **1本が窓の幅の半分より短いと、巻き戻りの手前で右端に隙間が出る。**
 * 3本の全長は 3W、動く量は W なので、見えている窓は最も進んだ時点で
 * `[W, W+V]` を映す。これが 3W に収まる条件が `V ≤ 2W`。
 * イベントが2〜3件しかないときはこれを割り、**流れているのに何も無い**
 * 帯が周期的に現れる（旧トップページがそうなっていた）。
 *
 * そこで、1本が十分長くなるまで同じ並びを繰り返してから3本つなぐ。
 * 窓は本文と同じ幅（`max-w-5xl` ≒ 1024px）までなので必要なのは2枚だが、
 * 余裕を持たせてある（描くカードが増えるだけで、速さには影響しない）。
 */

/** カード1枚の幅（`w-80` = 320px）＋ 間隔（`gap-3` = 12px） */
const CARD_PITCH = 332

/**
 * 1本に最低限入れるカードの枚数。
 *
 * 8枚 ≒ 2656px なので、`V ≤ 2W` は窓の幅 5312px まで成り立つ。
 * 窓は `max-w-5xl`（約1024px）で頭打ちなので、実際には大きく余っている。
 */
export const MIN_CARDS_PER_SEGMENT = 8

/**
 * カード1枚が通り過ぎるのにかける秒数。**ここが「流れる速さ」そのもの。**
 *
 * 332px / 4秒 = 83px/秒。題名を読み切れる速さにしてある。
 * **ここだけ直せば速さが変わる。** 秒数を CSS に書くと枚数で速さが変わる。
 */
const SECONDS_PER_CARD = 4

/**
 * 一周にかける秒数。
 *
 * **枚数から出す。** CSS に固定の秒数を書くと、1周の距離が枚数で変わるのに
 * 時間が同じになるため、**イベントが多いほど速く流れる。**
 * 3件の日は目で追えるのに20件の日は読めない、という状態になっていた。
 */
export function marqueeDuration(cardCount: number): number {
  return cardCount * SECONDS_PER_CARD
}

/** つなぐ本数。`@keyframes marquee` の -33.333% と対。**片方だけ変えない** */
export const MARQUEE_SEGMENTS = 3

/** 1本の幅の目安（px）。テストが `V ≤ 2W` を確かめるのに使う */
export function segmentWidth(cardCount: number): number {
  return cardCount * CARD_PITCH
}

/**
 * 1本ぶんの並び。渡された並びを、必要な長さになるまで繰り返す。
 *
 * 順番は変えない（点数の高い順に出す、という並びを崩さない）。
 */
export function marqueeSegment<T>(items: T[]): T[] {
  if (items.length === 0) return []

  const repeat = Math.ceil(MIN_CARDS_PER_SEGMENT / items.length)
  return Array.from({ length: repeat }, () => items).flat()
}
