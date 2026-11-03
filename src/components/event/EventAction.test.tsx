import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { EventAction, type EventActionState } from './EventAction'

/**
 * 幹事の操作。
 *
 * **参加者用の操作と幹事メニューは横に並べる。** 以前は幹事メニューの中に
 * 「自身の参加登録」を畳んでいて、自分が参加できているかどうかが
 * 開くまで分からなかった。畳み直すと同じ状態に戻るので、ここで守る。
 */
function setup(
  state: EventActionState,
  selfState?: EventActionState,
  cancelled = false,
  canCancel = true
) {
  const onParticipate = vi.fn()
  const onEditParticipation = vi.fn()
  render(
    <EventAction
      eventId="evt1"
      cancelled={cancelled}
      canCancel={canCancel}
      state={state}
      selfState={selfState}
      onParticipate={onParticipate}
      onEditParticipation={onEditParticipation}
    />
  )
  return { onParticipate, onEditParticipation }
}

describe('幹事', () => {
  it('参加者用の操作と幹事メニューを並べて出す', () => {
    setup({ kind: 'host' }, { kind: 'open' })

    expect(screen.getByRole('button', { name: '参加登録' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /幹事メニュー/ })).toBeTruthy()
  })

  it('幹事メニューの中に自身の参加は入れない', () => {
    setup({ kind: 'host' }, { kind: 'open' })
    fireEvent.click(screen.getByRole('button', { name: /幹事メニュー/ }))

    expect(screen.queryByText('自身の参加登録')).toBeNull()
  })

  it('既に参加していれば「登録」ではなく回答済みの姿になる', () => {
    const { onEditParticipation } = setup(
      { kind: 'host' },
      { kind: 'registered', status: 'attending' }
    )

    fireEvent.click(screen.getByRole('button', { name: /回答：参加/ }))
    expect(onEditParticipation).toHaveBeenCalled()
  })

  it('締切後は幹事でも登録できないことをボタンに出す', () => {
    setup({ kind: 'host' }, { kind: 'closed' })
    expect(screen.getByRole('button', { name: /回答締切を過ぎました/ })).toBeTruthy()
  })

  it('中止後は参加者用の操作を出さない（中止の知らせと同じことを二度言わない）', () => {
    setup({ kind: 'host' }, { kind: 'cancelled' }, true)

    expect(screen.queryByText('このイベントは中止されました')).toBeNull()
    expect(screen.getByRole('button', { name: /幹事メニュー/ })).toBeTruthy()
  })

  /* Radix のメニューはクリックでは開かない（pointerdown を見る）。キーボードで開く */
  const openHostMenu = () =>
    fireEvent.keyDown(screen.getByRole('button', { name: /幹事メニュー/ }), { key: 'Enter' })

  it('主催者には中止の項目を出す', () => {
    setup({ kind: 'host' }, { kind: 'open' })
    openHostMenu()

    expect(screen.getByRole('menuitem', { name: 'イベントを中止' })).toBeTruthy()
  })

  it('幹事には編集を出すが、中止の項目は出さない', () => {
    setup({ kind: 'host' }, { kind: 'open' }, false, false)
    openHostMenu()

    expect(screen.getByRole('menuitem', { name: 'イベントを編集' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'イベントを中止' })).toBeNull()
  })
})

/*
  キャンセルは参加登録モーダルの選択肢に統合した。
  **押すとプルダウンではなく変更モーダルが開く。**
*/
describe('回答済みの参加者', () => {
  it('押すと変更モーダルが開く', () => {
    const { onEditParticipation } = setup({ kind: 'registered', status: 'maybe' })

    fireEvent.click(screen.getByRole('button', { name: /回答：未定/ }))
    expect(onEditParticipation).toHaveBeenCalled()
  })

  it('キャンセルの項目をここには持たない', () => {
    setup({ kind: 'registered', status: 'attending' })
    expect(screen.queryByText('参加をキャンセル')).toBeNull()
  })
})
