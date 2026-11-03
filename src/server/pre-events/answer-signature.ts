import 'server-only'

/**
 * 日程調整の回答の中身を1つの文字列にする。
 *
 * **回答は毎回「総入れ替え」で保存される**（`pre-events/[id]/participate` の
 * POST が `deleteMany` → `createMany` する）。書き込んだ結果からは、新しく
 * 答えたのか、開いて同じ内容で保存し直しただけなのかが分からない。
 * 消す前に読んで署名を比べれば、中身が変わっていない保存で主催者に
 * 通知が飛ぶのを防げる。
 *
 * **並び順に依存させない。** 総入れ替えなので行の順は毎回変わる。
 * 候補日ごとの回答を並べ替えてから繋ぐ。
 */
export type AnswerRow = {
  dateOptionId: string
  status: string
  comment: string | null
  autoRegisterWhenPromoted: boolean
}

export function answerSignature(rows: AnswerRow[]): string {
  const perDate = rows.map((r) => [r.dateOptionId, r.status] as const).sort()

  /*
    コメントと自動登録は回答全体に1つの値だが、行ごとに同じ値が入っている。
    どの行から取っても同じなので先頭を使う（行が無ければ既定値）。
  */
  const first = rows[0]
  return JSON.stringify([
    perDate,
    first?.comment ?? null,
    first?.autoRegisterWhenPromoted ?? false,
  ])
}
