import { describe, expect, it } from 'vitest'

import {
  byDateTime,
  dateOptionKey,
  endDateForSpan,
  endsNextDay,
  formatDay,
  formatTimeRange,
  shouldShowEnd,
  shouldShowTime,
  spanDays,
  spanEndLabel,
  weekdayLabel,
  withSpanDays,
  withStartDate,
} from './date-option'

describe('dateOptionKey', () => {
  it('同じ日でも時刻が違えば別の候補として数える', () => {
    const noon = { startDate: '2026-09-12', startTime: '13:00', endTime: '15:00' }
    const night = { startDate: '2026-09-12', startTime: '19:00', endTime: '21:00' }
    expect(dateOptionKey(noon)).not.toBe(dateOptionKey(night))
  })

  it('時刻なしと 00:00 は別物として扱わない（未入力は空文字に均す）', () => {
    expect(dateOptionKey({ startDate: '2026-09-12' })).toBe(
      dateOptionKey({ startDate: '2026-09-12', startTime: undefined })
    )
  })
})

describe('formatTimeRange', () => {
  it('時刻が無ければ空', () => {
    expect(formatTimeRange({ startDate: '2026-09-12' })).toBe('')
  })

  it('開始と終了', () => {
    expect(
      formatTimeRange({ startDate: '2026-09-12', startTime: '19:00', endTime: '21:00' })
    ).toBe('19:00–21:00')
  })

  it('開始だけなら「19:00〜」。終了は空にできる', () => {
    expect(formatTimeRange({ startDate: '2026-09-12', startTime: '19:00' })).toBe('19:00〜')
  })

  it('日をまたぐときは翌と付ける。時刻だけ見ても分からないので', () => {
    expect(
      formatTimeRange({ startDate: '2026-09-12', startTime: '22:00', endTime: '02:00' })
    ).toBe('22:00–翌02:00')
  })

  it('終了日を持つ候補は「翌」を付けない。日付そのものが別に出る', () => {
    expect(
      formatTimeRange({
        startDate: '2026-09-12',
        startTime: '22:00',
        endDate: '2026-09-14',
        endTime: '02:00',
      })
    ).toBe('22:00–02:00')
  })
})

describe('endsNextDay', () => {
  it('終了が開始より前なら翌日', () => {
    expect(
      endsNextDay({ startDate: '2026-09-12', startTime: '22:00', endTime: '02:00' })
    ).toBe(true)
  })

  it('同じ時刻は翌日にしない。0分の候補として扱う', () => {
    expect(
      endsNextDay({ startDate: '2026-09-12', startTime: '19:00', endTime: '19:00' })
    ).toBe(false)
  })

  it('開始が無ければ判断しない', () => {
    expect(endsNextDay({ startDate: '2026-09-12', endTime: '02:00' })).toBe(false)
  })
})

describe('spanEndLabel', () => {
  it('複数日にわたる候補だけラベルを出す', () => {
    expect(
      spanEndLabel({ startDate: '2026-09-12', endDate: '2026-09-14' })
    ).toBe('〜9月14日(月)')
  })

  it('同じ日で終わるなら出さない', () => {
    expect(spanEndLabel({ startDate: '2026-09-12', endDate: '2026-09-12' })).toBeNull()
  })
})

describe('formatDay / weekdayLabel', () => {
  it('曜日まで出す。日付だけでは平日か週末か分からない', () => {
    expect(formatDay('2026-09-12')).toBe('9月12日(土)')
    expect(weekdayLabel('2026-09-12')).toBe('(土)')
  })

  it('打ちかけの日付では曜日を出さない', () => {
    expect(weekdayLabel('')).toBe('')
    expect(weekdayLabel('2026-09')).toBe('')
  })
})

describe('byDateTime', () => {
  it('日付、同じ日なら時刻の順に並ぶ', () => {
    const options = [
      { startDate: '2026-09-12', startTime: '19:00' },
      { startDate: '2026-09-11' },
      { startDate: '2026-09-12', startTime: '13:00' },
    ]
    expect([...options].sort(byDateTime)).toEqual([
      { startDate: '2026-09-11' },
      { startDate: '2026-09-12', startTime: '13:00' },
      { startDate: '2026-09-12', startTime: '19:00' },
    ])
  })

  it('時刻なしは同じ日の先頭。終日の候補が時間帯より後に来ると読みにくい', () => {
    const options = [
      { startDate: '2026-09-12', startTime: '13:00' },
      { startDate: '2026-09-12' },
    ]
    expect([...options].sort(byDateTime)[0]).toEqual({ startDate: '2026-09-12' })
  })
})

describe('shouldShowTime', () => {
  /*
    編集画面では候補が `reset()` であとから入る。マウント時の値で決めると
    時刻の欄が出ず、**時刻が消えたように見える**（実際そうなっていた）。
  */
  it('未操作なら値に従う。あとから流し込まれた時刻にも追いつく', () => {
    expect(shouldShowTime(null, [])).toBe(false)
    expect(shouldShowTime(null, [{ startDate: '2026-09-12', startTime: '19:00' }])).toBe(true)
  })

  it('終了時刻だけでも欄を出す', () => {
    expect(shouldShowTime(null, [{ startDate: '2026-09-12', endTime: '21:00' }])).toBe(true)
  })

  it('利用者が「指定をやめる」を選んだら、値が残っていても出さない', () => {
    expect(shouldShowTime(false, [{ startDate: '2026-09-12', startTime: '19:00' }])).toBe(false)
  })

  it('利用者が「時刻を指定」を選んだら、値が空でも出す', () => {
    expect(shouldShowTime(true, [{ startDate: '2026-09-12' }])).toBe(true)
  })
})

describe('spanDays', () => {
  it('終了日が無ければ1日間', () => {
    expect(spanDays({ startDate: '2026-09-12' })).toBe(1)
  })

  it('開始日を1日目と数える（9/12–9/14 は3日間）', () => {
    expect(spanDays({ startDate: '2026-09-12', endDate: '2026-09-14' })).toBe(3)
  })

  it('月をまたいでも数えられる', () => {
    expect(spanDays({ startDate: '2026-09-30', endDate: '2026-10-02' })).toBe(3)
  })

  /*
    **22:00–翌02:00 は1日間。** あれは終了「時刻」で表していて、日数の話ではない。
    2日間と数えると、日数をまとめて変えたときに巻き込んで、夜またぎの候補が
    勝手に泊まりがけになる。
  */
  it('日をまたぐだけの候補は1日間として数える', () => {
    expect(spanDays({ startDate: '2026-09-12', startTime: '22:00', endTime: '02:00' })).toBe(1)
  })

  it('終了日が開始日と同じなら1日間', () => {
    expect(spanDays({ startDate: '2026-09-12', endDate: '2026-09-12' })).toBe(1)
  })
})

describe('endDateForSpan', () => {
  it('1日間なら終了日を持たせない（同じ日の終了日は保存の形を変えてしまう）', () => {
    expect(endDateForSpan('2026-09-12', 1)).toBeUndefined()
  })

  it('3日間なら2日後', () => {
    expect(endDateForSpan('2026-09-12', 3)).toBe('2026-09-14')
  })

  it('日付が未入力の行では決めようがない', () => {
    expect(endDateForSpan('', 3)).toBeUndefined()
  })
})

describe('withStartDate', () => {
  it('日数を保ったまま動かす（9/12–9/14 を 9/19 へ移すと 9/19–9/21）', () => {
    expect(withStartDate({ startDate: '2026-09-12', endDate: '2026-09-14' }, '2026-09-19')).toEqual(
      { startDate: '2026-09-19', endDate: '2026-09-21' }
    )
  })

  it('1日間の候補に終了日を生やさない', () => {
    expect(withStartDate({ startDate: '2026-09-12', startTime: '19:00' }, '2026-09-19')).toEqual({
      startDate: '2026-09-19',
      startTime: '19:00',
      endDate: undefined,
    })
  })
})

describe('withSpanDays', () => {
  it('開始日はそのままに、終了日だけ付け替える', () => {
    expect(withSpanDays({ startDate: '2026-09-12', startTime: '10:00' }, 3)).toEqual({
      startDate: '2026-09-12',
      startTime: '10:00',
      endDate: '2026-09-14',
    })
  })

  it('1日間に戻すと終了日が消える', () => {
    expect(withSpanDays({ startDate: '2026-09-12', endDate: '2026-09-14' }, 1)).toEqual({
      startDate: '2026-09-12',
      endDate: undefined,
    })
  })
})

describe('shouldShowEnd', () => {
  it('未操作なら値に従う。保存済みの複数日の候補を開けば欄が出る', () => {
    expect(shouldShowEnd(null, [{ startDate: '2026-09-12' }])).toBe(false)
    expect(
      shouldShowEnd(null, [{ startDate: '2026-09-12', endDate: '2026-09-14' }])
    ).toBe(true)
  })

  /* 欄が出ないと 02:00 を直す手段が無くなる（終了時刻は「終了」の欄が持つ） */
  it('日をまたぐだけの候補でも、終了時刻があれば欄を出す', () => {
    expect(
      shouldShowEnd(null, [{ startDate: '2026-09-12', startTime: '22:00', endTime: '02:00' }])
    ).toBe(true)
  })

  it('開始時刻だけの候補では欄を出さない', () => {
    expect(shouldShowEnd(null, [{ startDate: '2026-09-12', startTime: '19:00' }])).toBe(false)
  })

  it('利用者の判断が値より優先される', () => {
    expect(shouldShowEnd(false, [{ startDate: '2026-09-12', endDate: '2026-09-14' }])).toBe(false)
    expect(shouldShowEnd(true, [{ startDate: '2026-09-12' }])).toBe(true)
  })
})
