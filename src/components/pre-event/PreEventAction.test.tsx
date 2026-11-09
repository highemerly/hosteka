import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PreEventAction, type PreEventActionState } from './PreEventAction'

/**
 * 幹事の操作。**イベント側（`EventAction`）と同じ形にする。**
 * 回答者用の操作と幹事メニューを横に並べる。
 */
function setup(
  state: PreEventActionState,
  selfState?: PreEventActionState,
  onDelete?: () => void
) {
  const onRespond = vi.fn()
  render(
    <PreEventAction
      preEventId="pre1"
      state={state}
      selfState={selfState}
      onRespond={onRespond}
      onDelete={onDelete}
    />
  )
  return { onRespond }
}

describe('幹事', () => {
  it('回答者用の操作と幹事メニューを並べて出す', () => {
    setup({ kind: 'host', answered: false }, { kind: 'open' })

    expect(screen.getByRole('button', { name: '日程を回答する' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /幹事メニュー/ })).toBeTruthy()
  })

  it('幹事メニューの中に自身の回答は入れない', () => {
    setup({ kind: 'host', answered: false }, { kind: 'open' })
    fireEvent.click(screen.getByRole('button', { name: /幹事メニュー/ }))

    expect(screen.queryByText('自身の日程を回答')).toBeNull()
    expect(screen.queryByText('自身の回答を変更')).toBeNull()
  })

  it('回答済みなら「変更する」になる', () => {
    const { onRespond } = setup({ kind: 'host', answered: true }, { kind: 'answered' })

    fireEvent.click(screen.getByRole('button', { name: /回答を変更する/ }))
    expect(onRespond).toHaveBeenCalled()
  })

  it('締切後は幹事でも受付が終わっていることをボタンに出す', () => {
    setup({ kind: 'host', answered: false }, { kind: 'closed', answered: false })
    expect(screen.getByRole('button', { name: /回答の受付は終了しました/ })).toBeTruthy()
  })
})

/*
  **グループのスタッフは編集できるが、削除はできない。** 画面は `onDelete` を
  渡さないことで項目ごと消す（`PreEventDetailScreen` が `viewer.canDelete` で決める）。
  Radix のメニューはクリックでは開かない（pointerdown を見る）ので、キーボードで開く。
*/
describe('幹事メニューの削除', () => {
  const openHostMenu = () =>
    fireEvent.keyDown(screen.getByRole('button', { name: /幹事メニュー/ }), { key: 'Enter' })

  it('削除できる人には項目を出す', () => {
    setup({ kind: 'host', answered: false }, { kind: 'open' }, vi.fn())
    openHostMenu()

    expect(screen.getByRole('menuitem', { name: '日程調整を削除' })).toBeTruthy()
  })

  it('削除できない人には、編集を出して削除は出さない', () => {
    setup({ kind: 'host', answered: false }, { kind: 'open' })
    openHostMenu()

    expect(screen.getByRole('menuitem', { name: /編集/ })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: '日程調整を削除' })).toBeNull()
  })
})

/*
  日程調整をイベントにする。**削除と同じ人だけ**（作成者とグループの管理責任者）。
  イベントにしたあとは編集できない（サーバーが 409 で断る）ので、入口も出さない。
*/
describe('イベントにする', () => {
  const openHostMenu = () =>
    fireEvent.keyDown(screen.getByRole('button', { name: /幹事メニュー/ }), { key: 'Enter' })

  function renderHost(props: { promoted?: boolean; canPromote?: boolean }) {
    render(
      <PreEventAction
        preEventId="pre1"
        state={{ kind: 'host', answered: false }}
        selfState={props.promoted ? { kind: 'promoted', eventId: 'evt1' } : { kind: 'open' }}
        {...props}
      />
    )
  }

  it('できる人には幹事メニューに入口を出す', () => {
    renderHost({ canPromote: true })
    openHostMenu()

    const item = screen.getByRole('menuitem', { name: '日程を決めてイベントにする' })
    expect(item.getAttribute('href')).toBe('/pre-events/pre1/promote')
  })

  it('できない人には出さない', () => {
    renderHost({ canPromote: false })
    openHostMenu()

    expect(screen.queryByRole('menuitem', { name: '日程を決めてイベントにする' })).toBeNull()
  })

  it('イベントにしたあとは、編集を出さず、回答の代わりにイベントへの行き先を出す', () => {
    renderHost({ promoted: true })
    expect(screen.getByRole('link', { name: /イベントのページへ/ }).getAttribute('href')).toBe(
      '/events/evt1'
    )

    openHostMenu()
    expect(screen.queryByRole('menuitem', { name: /編集/ })).toBeNull()
  })

  it('イベントが消えていれば、押せない札にする', () => {
    render(<PreEventAction preEventId="pre1" state={{ kind: 'promoted', eventId: null }} />)
    expect(screen.getByRole('button', { name: 'イベントになりました' }).hasAttribute('disabled')).toBe(true)
  })
})
