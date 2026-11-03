import * as React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { ConfirmDialogProvider } from '@/components/common/ConfirmDialog'

import { DateOptionsField } from './DateOptionsField'
import type { DateOptionDraft } from './date-option'

/*
  カレンダーは過去の日を押せないので、**今日がいつかでテストの結果が変わる。**
  固定しないと、2026-09-12 を現実の日付が追い越した日に赤くなる。

  `toFake` を Date だけに絞るのは `EventPreview.test.tsx` と同じ理由 —
  タイマーまで差し替えると Radix のモーダルが開かない。オフセットまで
  書くのは CLAUDE.md の決まり（テストは UTC で回る）。
*/
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-01T09:00:00+09:00'))
})

afterAll(() => {
  vi.useRealTimers()
})

/**
 * 値を持たせて描画する。**候補を足す流れは1回の `onChange` では終わらない** —
 * 「カレンダーで日を選んでから時刻を入れる」のように、前の変更の結果に
 * 次の操作が乗る。呼び出し側と同じく状態を持たせないと追えない。
 */
function setup(initial: DateOptionDraft[] = []) {
  const onChange = vi.fn()

  function Harness() {
    const [options, setOptions] = React.useState(initial)
    return (
      <ConfirmDialogProvider>
        <DateOptionsField
          options={options}
          onChange={(next) => {
            onChange(next)
            setOptions(next)
          }}
        />
      </ConfirmDialogProvider>
    )
  }

  const result = render(<Harness />)
  return {
    ...result,
    onChange,
    /** 最後に渡された候補の並び */
    latest: () => onChange.mock.lastCall?.[0] as DateOptionDraft[],
  }
}

const value = (label: string) => (screen.getByLabelText(label) as HTMLInputElement).value

/**
 * `＋時刻を指定` `＋終了日時を指定` は**欄を出すだけ**で値を入れない。
 *
 * 値を入れる操作にすると、押した行にだけ時刻が付いて他の行には欄すら
 * 無い状態になり、直す手段が無くなる。
 *
 * **開始と終了で分ける。** `＋時刻を指定` が出すのは開始時刻だけで、
 * 終了時刻は終了日と同じ `＋終了日時を指定` が持つ。
 */
describe('DateOptionsField（欄を出す）', () => {
  it('候補が1件も無くても、日付の欄が1つ出ている', () => {
    setup()
    expect(screen.getByLabelText('1番目の候補日')).toBeTruthy()
  })

  it('時刻を指定しても、値は入らない', () => {
    const { onChange } = setup([{ startDate: '2026-09-12' }])
    fireEvent.click(screen.getByRole('button', { name: '時刻を指定' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(value('1番目の候補の開始時刻')).toBe('')
  })

  /* 「19:00から」で足りる候補は多い。終了時刻まで出すと毎回空のまま通る */
  it('時刻を指定して出るのは、開始時刻だけ', () => {
    setup([{ startDate: '2026-09-12' }])
    fireEvent.click(screen.getByRole('button', { name: '時刻を指定' }))
    expect(screen.queryByLabelText('1番目の候補の終了時刻')).toBeNull()
  })

  it('時刻を指定すると、終了は「終了日時」になる', () => {
    setup([{ startDate: '2026-09-12' }])
    expect(screen.getByRole('button', { name: '終了日を指定' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '時刻を指定' }))
    fireEvent.click(screen.getByRole('button', { name: '終了日時を指定' }))
    expect(screen.getByLabelText('1番目の候補の終了日')).toBeTruthy()
    expect(screen.getByLabelText('1番目の候補の終了時刻')).toBeTruthy()
  })

  it('時刻の欄は、全部の候補に出る', () => {
    setup([{ startDate: '2026-09-12' }, { startDate: '2026-09-19' }])
    fireEvent.click(screen.getByRole('button', { name: '時刻を指定' }))
    expect(screen.getByLabelText('2番目の候補の開始時刻')).toBeTruthy()
  })

  it('欄を出す操作は1か所だけに出る', () => {
    setup([{ startDate: '2026-09-12' }, { startDate: '2026-09-19' }])
    expect(screen.getAllByRole('button', { name: '時刻を指定' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: '終了日を指定' })).toHaveLength(1)
  })

  it('終了の指定をやめると、終了日と終了時刻が消える', () => {
    const { onChange } = setup([
      {
        startDate: '2026-09-12',
        startTime: '19:00',
        endDate: '2026-09-14',
        endTime: '21:00',
      },
    ])
    fireEvent.click(screen.getByRole('button', { name: '終了日時の指定をやめる' }))
    expect(onChange).toHaveBeenCalledWith([
      { startDate: '2026-09-12', startTime: '19:00', endDate: undefined, endTime: undefined },
    ])
  })

  it('指定をやめると、全部の候補から時刻が消える', () => {
    const { onChange } = setup([
      { startDate: '2026-09-12', startTime: '19:00', endTime: '21:00' },
      { startDate: '2026-09-19', startTime: '13:00', endTime: '17:00' },
    ])
    fireEvent.click(screen.getByRole('button', { name: '時刻の指定をやめる' }))
    expect(onChange).toHaveBeenCalledWith([
      { startDate: '2026-09-12', startTime: undefined, endTime: undefined },
      { startDate: '2026-09-19', startTime: undefined, endTime: undefined },
    ])
  })

  /*
    編集画面ではフォームの初期値が空で、保存済みの候補は `reset()` で
    あとから流し込まれる。マウント時の値で決めると欄が出ない。
  */
  it('保存済みの時刻付きの候補を開くと、時刻の欄が出ている', () => {
    setup([{ startDate: '2026-09-12', startTime: '19:00' }])
    expect(value('1番目の候補の開始時刻')).toBe('19:00')
    expect(screen.queryByRole('button', { name: '時刻を指定' })).toBeNull()
  })

  it('保存済みの複数日の候補を開くと、終了日の欄が出ている', () => {
    setup([{ startDate: '2026-09-12', endDate: '2026-09-14' }])
    expect(value('1番目の候補の終了日')).toBe('2026-09-14')
    expect(screen.queryByRole('button', { name: '終了日を指定' })).toBeNull()
  })

  /*
    22:00–翌02:00 は終了「時刻」で表していて泊まりがけではないが、
    **終了時刻は終了の欄が持つ。** 欄が出ないと 02:00 を直せなくなる。
  */
  it('日をまたぐだけの候補でも、終了時刻の欄が出ている', () => {
    setup([{ startDate: '2026-09-12', startTime: '22:00', endTime: '02:00' }])
    expect(value('1番目の候補の終了時刻')).toBe('02:00')
    expect(screen.queryByRole('button', { name: '終了日時を指定' })).toBeNull()
  })
})

/**
 * 引き継ぎは**「候補を追加」を押したときだけ**。
 *
 * 以前は「前の既定値のままの候補は付いてくる」という規則で、どれが
 * 付いてきてどれが取り残されるのかが画面から読めなかった。
 */
describe('DateOptionsField（引き継ぎ）', () => {
  it('候補を追加すると、直前の候補の時刻が入る', () => {
    const { onChange } = setup([
      { startDate: '2026-09-12', startTime: '19:00', endTime: '21:00' },
    ])
    fireEvent.click(screen.getByRole('button', { name: '候補を追加' }))
    expect(onChange).toHaveBeenCalledWith([
      { startDate: '2026-09-12', startTime: '19:00', endTime: '21:00' },
      { startDate: '', startTime: '19:00', endTime: '21:00' },
    ])
  })

  it('他の候補の時刻を直しても、勝手には付いてこない', () => {
    const { onChange } = setup([
      { startDate: '2026-09-12', startTime: '19:00', endTime: '21:00' },
      { startDate: '2026-09-19', startTime: '19:00', endTime: '21:00' },
    ])
    fireEvent.change(screen.getByLabelText('1番目の候補の開始時刻'), {
      target: { value: '13:00' },
    })
    expect(onChange).toHaveBeenCalledWith([
      { startDate: '2026-09-12', startTime: '13:00', endTime: '21:00' },
      { startDate: '2026-09-19', startTime: '19:00', endTime: '21:00' },
    ])
  })

  /*
    追加した時点では日付がまだ無いので、終了日を入れられない。
    **日付が決まった時点で引き継ぐ。**
  */
  it('直前が3日間なら、追加した候補も日付を入れた時点で3日間になる', () => {
    const { onChange } = setup([{ startDate: '2026-09-12', endDate: '2026-09-14' }])
    fireEvent.click(screen.getByRole('button', { name: '候補を追加' }))
    fireEvent.change(screen.getByLabelText('2番目の候補日'), {
      target: { value: '2026-09-19' },
    })
    expect(onChange).toHaveBeenLastCalledWith([
      { startDate: '2026-09-12', endDate: '2026-09-14' },
      { startDate: '2026-09-19', endDate: '2026-09-21' },
    ])
  })

  it('開始日を動かすと、終了日が日数を保って付いてくる', () => {
    const { onChange } = setup([{ startDate: '2026-09-12', endDate: '2026-09-14' }])
    fireEvent.change(screen.getByLabelText('1番目の候補日'), {
      target: { value: '2026-09-19' },
    })
    expect(onChange).toHaveBeenCalledWith([
      { startDate: '2026-09-19', endDate: '2026-09-21' },
    ])
  })

  /*
    開始日と同じ終了日を持たせると、保存の形が「終了なし」から
    「その日の0時に終わる」に変わる（pre-event-payload.ts の resolveEndDate）。
  */
  it('終了日を開始日と同じにすると、終了日を持たない候補に戻る', () => {
    const { onChange } = setup([{ startDate: '2026-09-12', endDate: '2026-09-14' }])
    fireEvent.change(screen.getByLabelText('1番目の候補の終了日'), {
      target: { value: '2026-09-12' },
    })
    expect(onChange).toHaveBeenCalledWith([
      { startDate: '2026-09-12', endDate: undefined },
    ])
  })
})

/**
 * カレンダーは「まとめて入力」の中。**時刻の欄を持つ** — 先に日を選んでから
 * 時刻を決める順番でも、選んだ日すべてに入る。
 */
describe('DateOptionsField（まとめて入力）', () => {
  const openCalendar = () =>
    fireEvent.click(screen.getByRole('button', { name: '候補日をまとめて入力' }))

  /*
    モーダルの中の `＋指定` は一覧と同じ状態を切り替える。
    Radix が背後を `aria-hidden` にするので、開いている間に引ける
    「時刻を指定」はモーダルのものだけ。
  */
  const specifyTimeInDialog = () =>
    fireEvent.click(screen.getByRole('button', { name: '時刻を指定' }))

  it('最初は升目を出さない', () => {
    setup()
    expect(screen.queryByRole('button', { name: '9月12日' })).toBeNull()
  })

  it('選んだ日が候補になる', () => {
    const { onChange } = setup()
    openCalendar()
    fireEvent.click(screen.getByRole('button', { name: '9月12日' }))
    expect(onChange).toHaveBeenCalledWith([
      { startDate: '2026-09-12', startTime: undefined, endTime: undefined, endDate: undefined },
    ])
  })

  it('あとから入れた時刻が、そのモーダルで選んだ日すべてに入る', () => {
    const { latest } = setup()
    openCalendar()
    specifyTimeInDialog()
    fireEvent.click(screen.getByRole('button', { name: '9月12日' }))
    fireEvent.click(screen.getByRole('button', { name: '9月19日' }))
    fireEvent.change(screen.getByLabelText('選んだ候補の開始時刻'), {
      target: { value: '19:00' },
    })
    expect(latest().map((o) => [o.startDate, o.startTime])).toEqual([
      ['2026-09-12', '19:00'],
      ['2026-09-19', '19:00'],
    ])
  })

  it('モーダルを開く前からあった候補には、モーダルの時刻が入らない', () => {
    const { latest } = setup([{ startDate: '2026-09-05' }])
    openCalendar()
    specifyTimeInDialog()
    fireEvent.click(screen.getByRole('button', { name: '9月12日' }))
    fireEvent.change(screen.getByLabelText('選んだ候補の開始時刻'), {
      target: { value: '19:00' },
    })
    expect(latest().map((o) => [o.startDate, o.startTime])).toEqual([
      ['2026-09-05', undefined],
      ['2026-09-12', '19:00'],
    ])
  })

  /* 出していないと、時刻を使うか決めるために一度閉じることになる */
  it('モーダルの中でも、時刻の欄を出せる', () => {
    setup()
    openCalendar()
    expect(screen.queryByLabelText('選んだ候補の開始時刻')).toBeNull()
    specifyTimeInDialog()
    expect(screen.getByLabelText('選んだ候補の開始時刻')).toBeTruthy()
  })

  it('モーダルで時刻を出すと、一覧側にも欄が出る', () => {
    setup([{ startDate: '2026-09-05' }])
    openCalendar()
    specifyTimeInDialog()
    fireEvent.click(screen.getByRole('button', { name: '決定' }))
    expect(screen.getByLabelText('1番目の候補の開始時刻')).toBeTruthy()
  })

  it('終了時刻の欄は、終了まで指定しているときだけ出る', () => {
    setup([{ startDate: '2026-09-05', startTime: '19:00' }])
    openCalendar()
    expect(screen.queryByLabelText('選んだ候補の終了時刻')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '終了日時を指定' }))
    expect(screen.getByLabelText('選んだ候補の終了時刻')).toBeTruthy()
  })

  it('選んだ日にも、直前の候補の日数が入る', () => {
    const { latest } = setup([{ startDate: '2026-09-05', endDate: '2026-09-07' }])
    openCalendar()
    fireEvent.click(screen.getByRole('button', { name: '9月12日' }))
    expect(latest()[1]).toMatchObject({
      startDate: '2026-09-12',
      endDate: '2026-09-14',
    })
  })
})
