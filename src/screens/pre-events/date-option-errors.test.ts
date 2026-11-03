import { describe, expect, it } from 'vitest'

import { flattenDateOptionErrors } from './date-option-errors'

describe('flattenDateOptionErrors', () => {
  it('エラーが無ければ空', () => {
    expect(flattenDateOptionErrors({})).toEqual({ rows: {} })
  })

  it('配列そのもののエラー（件数・重複）は欄全体に出す', () => {
    expect(
      flattenDateOptionErrors({ dateOptions: { message: '候補日を1つ以上追加してください' } })
    ).toEqual({ message: '候補日を1つ以上追加してください', rows: {} })
  })

  it('行のエラーは何行目かを保って返す', () => {
    const errors = {
      dateOptions: [
        undefined,
        { startDate: { message: '日付の形式が正しくありません' } },
      ] as never,
    }
    expect(flattenDateOptionErrors(errors).rows).toEqual({
      1: '日付の形式が正しくありません',
    })
  })

  it('行のエラーだけでも、欄全体に文言を出す。上のまとめが空にならないように', () => {
    const errors = {
      dateOptions: [{ startTime: { message: '開始時刻を入れてください' } }] as never,
    }
    expect(flattenDateOptionErrors(errors).message).toBe('候補日の入力を確かめてください')
  })

  it('配列と行の両方にエラーがあるときは、配列側（root）を欄全体に出す', () => {
    const node = [{ startDate: { message: '日付の形式が正しくありません' } }] as never as {
      message?: string
    }[]
    Object.assign(node, { root: { message: '同じ日時の候補が重なっています' } })

    const result = flattenDateOptionErrors({ dateOptions: node })
    expect(result.message).toBe('同じ日時の候補が重なっています')
    expect(result.rows).toEqual({ 0: '日付の形式が正しくありません' })
  })
})
