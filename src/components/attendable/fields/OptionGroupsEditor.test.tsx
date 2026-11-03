import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OptionGroupsEditor, type OptionGroupDraft } from './OptionGroupsEditor'

/**
 * オプションの編集。
 *
 * ここで守りたいのは**押し忘れで弾かれない形になっているか**。
 * 選択肢を1つだけ出して「選択肢を追加する」を押させると、押さないまま保存へ進んで
 * スキーマに弾かれる。設問として成立する数を最初から並べておく。
 */
function setup(groups: OptionGroupDraft[] = []) {
  const onChange = vi.fn()
  const result = render(<OptionGroupsEditor groups={groups} onChange={onChange} />)
  return { ...result, onChange }
}

const GROUP: OptionGroupDraft = {
  title: '懇親会',
  responseType: 'single',
  options: [{ name: '参加する' }, { name: '参加しない' }],
}

describe('OptionGroupsEditor', () => {
  it('オプションを追加すると選択肢が2つ並ぶ（1つでは設問にならない）', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    expect(onChange).toHaveBeenCalledWith([
      { title: '', responseType: 'single', options: [
        { name: '', maxParticipants: null },
        { name: '', maxParticipants: null },
      ] },
    ])
  })

  it('空の選択肢は使い回さない（片方を編集するともう片方まで変わる）', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: '追加する' }))

    const [{ options }] = onChange.mock.calls[0][0]
    expect(options[0]).not.toBe(options[1])
  })

  it('定員を空欄にしたときの意味を画面に書く', () => {
    setup([GROUP])
    expect(screen.getByText(/空欄の場合、人数制限なし/)).toBeTruthy()
  })

  /*
    「複数選択を許容する」のトグルは、オフが何なのかを切ってみるまで
    見せられなかった。名前で並べる形に変えてある。
  */
  it('回答の種類は単一選択・複数選択・自由入力から選ぶ', () => {
    const { onChange } = setup([GROUP])

    expect(screen.getByRole('radio', { name: '単一選択' }).getAttribute('aria-checked')).toBe(
      'true'
    )

    fireEvent.click(screen.getByRole('radio', { name: '複数選択' }))
    expect(onChange.mock.calls[0][0][0].responseType).toBe('multiple')

    fireEvent.click(screen.getByRole('radio', { name: '自由入力' }))
    expect(onChange.mock.calls[1][0][0].responseType).toBe('text')
  })

  /*
    **切り替えただけで選択肢を捨てない。** 押し間違いで消えると、
    戻したときに書き直すことになる。保存のときに落ちる
    （`eventOptionGroupSchema`）ので、持っていても害が無い。
  */
  it('自由入力では選択肢の欄を出さない。入力済みの選択肢は消さない', () => {
    const { onChange } = setup([{ ...GROUP, responseType: 'text' }])

    expect(screen.queryByRole('button', { name: '選択肢を追加する' })).toBeNull()
    expect(screen.queryByLabelText('選択肢1の名前')).toBeNull()
    expect(screen.getByText(/100文字まで入力できます/)).toBeTruthy()

    fireEvent.click(screen.getByRole('radio', { name: '単一選択' }))
    expect(onChange.mock.calls[0][0][0].options).toEqual(GROUP.options)
  })

  it('選択肢を追加すると1つずつ増える', () => {
    const { onChange } = setup([GROUP])
    fireEvent.click(screen.getByRole('button', { name: '選択肢を追加する' }))

    expect(onChange.mock.calls[0][0][0].options).toHaveLength(3)
  })
})
