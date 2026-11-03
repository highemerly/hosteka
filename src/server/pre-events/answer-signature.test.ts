import { describe, expect, it } from 'vitest'

import { answerSignature, type AnswerRow } from './answer-signature'

function rows(overrides: Partial<AnswerRow>[] = []): AnswerRow[] {
  const base: AnswerRow[] = [
    { dateOptionId: 'd1', status: 'available', comment: '夜なら', autoRegisterWhenPromoted: true },
    { dateOptionId: 'd2', status: 'unavailable', comment: '夜なら', autoRegisterWhenPromoted: true },
  ]
  return base.map((row, i) => ({ ...row, ...overrides[i] }))
}

/**
 * 回答は毎回「総入れ替え」で保存されるので、書き込んだ結果からは
 * 新規か変更かが分からない。消す前に読んで署名を比べる
 */
describe('回答の署名', () => {
  it('同じ内容を送り直しても変わらない', () => {
    expect(answerSignature(rows())).toBe(answerSignature(rows()))
  })

  /** 総入れ替えなので行の順は毎回変わる */
  it('行の順が違っても同じ', () => {
    const forward = rows()
    expect(answerSignature(forward)).toBe(answerSignature([forward[1], forward[0]]))
  })

  it('候補日への回答が変われば変わる', () => {
    expect(answerSignature(rows())).not.toBe(answerSignature(rows([{}, { status: 'maybe' }])))
  })

  it('コメントが変われば変わる', () => {
    expect(answerSignature(rows())).not.toBe(
      answerSignature(rows([{ comment: '昼でも' }, { comment: '昼でも' }]))
    )
  })

  it('自動登録の設定が変われば変わる', () => {
    expect(answerSignature(rows())).not.toBe(
      answerSignature(
        rows([{ autoRegisterWhenPromoted: false }, { autoRegisterWhenPromoted: false }])
      )
    )
  })

  it('候補日が増えれば変わる', () => {
    expect(answerSignature(rows())).not.toBe(
      answerSignature([
        ...rows(),
        { dateOptionId: 'd3', status: 'maybe', comment: '夜なら', autoRegisterWhenPromoted: true },
      ])
    )
  })

  /** まだ答えていない状態。新規の回答として扱う手がかりになる */
  it('回答が無ければ、答えたものと別の署名になる', () => {
    expect(answerSignature([])).not.toBe(answerSignature(rows()))
  })
})
