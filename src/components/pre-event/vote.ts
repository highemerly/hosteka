import type { PreEventVote } from '@/server/serializers/pre-event'

/**
 * 日程ごとの回答の扱い。
 *
 * **イベントの参加状態とは別物。** あちらは「イベントに参加するか」の
 * 1つの答えだが、こちらは候補日ごとに独立した3択。
 * 記号・語・並び順をここに集約して、投票欄と集計表で食い違わないようにする。
 */

export const VOTES: PreEventVote[] = ['available', 'maybe', 'unavailable']

export const VOTE_LABEL: Record<PreEventVote, string> = {
  available: '参加できる',
  maybe: '調整できる',
  unavailable: '参加できない',
}

/** 表や集計に出す短い記号。○△× は日本の日程調整で最も通じる */
export const VOTE_MARK: Record<PreEventVote, string> = {
  available: '○',
  maybe: '△',
  unavailable: '×',
}

export type DateOptionCounts = { available: number; maybe: number; unavailable: number }

/**
 * 候補日の「集まり具合」。
 *
 * **○だけで決めない。** △は「調整すれば出られる」なので、○が同数なら
 * △が多いほうが成立しやすい。○を1点、△を0.5点として重みを付ける。
 * 主催者が最後に決めるための目安であって、自動では決めない。
 */
export function optionScore(counts: DateOptionCounts): number {
  return counts.available + counts.maybe * 0.5
}

/**
 * 最も集まっている候補日のID。
 *
 * 同点なら**先に並んでいるほう**を返す（主催者が並べた順を尊重する）。
 * 誰も答えていなければ null — 0点の日を「best」と呼ぶと、
 * 回答が集まる前から決まったように読める。
 */
export function bestOptionId(
  options: { id: string; counts: DateOptionCounts }[]
): string | null {
  let best: { id: string; score: number } | null = null
  for (const option of options) {
    const score = optionScore(option.counts)
    if (score <= 0) continue
    if (!best || score > best.score) best = { id: option.id, score }
  }
  return best?.id ?? null
}

/** 同点で並んでいるか。1つに絞れないことを画面で伝えるために使う */
export function hasTiedBest(options: { id: string; counts: DateOptionCounts }[]): boolean {
  const scores = options.map((o) => optionScore(o.counts)).filter((s) => s > 0)
  if (scores.length === 0) return false
  const top = Math.max(...scores)
  return scores.filter((s) => s === top).length > 1
}
