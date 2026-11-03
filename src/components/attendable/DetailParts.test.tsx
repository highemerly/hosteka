import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ContactAction } from './DetailParts'

/**
 * 連絡の入口。
 *
 * 行き先は閲覧者によって0〜2つに変わる。1つ以上あれば必ずプルダウンを
 * 介し、使えない行き先はグレーアウトする。
 */
describe('ContactAction', () => {
  it('行き先が両方あるとプルダウンにする', () => {
    render(
      <ContactAction
        onContactOrganizer={() => {}}
        participantsHref="/events/e1/contact"
        participantsLabel="参加者全員に連絡"
      />
    )

    // 畳まれている間は行き先を名乗らない
    expect(screen.getByRole('button', { name: /連絡/ }).textContent).toBe('連絡')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('プルダウンを開くと両方の行き先が出る', () => {
    const onContactOrganizer = vi.fn()
    render(
      <ContactAction
        onContactOrganizer={onContactOrganizer}
        participantsHref="/events/e1/contact"
        participantsLabel="参加者全員に連絡"
      />
    )

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /連絡/ }),
      { button: 0, ctrlKey: false }
    )

    // 押すと閉じてしまうので、行き先を確かめてから押す
    expect(
      screen.getByRole('menuitem', { name: '参加者全員に連絡' }).getAttribute('href')
    ).toBe('/events/e1/contact')

    fireEvent.click(screen.getByRole('menuitem', { name: '主催者へ連絡' }))
    expect(onContactOrganizer).toHaveBeenCalled()
  })

  it('参加者全員へ連絡できなくてもプルダウンを出し、その項目をグレーアウトする', () => {
    render(
      <ContactAction
        onContactOrganizer={() => {}}
        participantsHref={null}
        participantsLabel="参加者全員に連絡"
      />
    )

    // 行き先の名前をボタンに直接出すと、スマホで横幅が伸びる
    expect(screen.getByRole('button', { name: /連絡/ }).textContent).toBe('連絡')

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /連絡/ }),
      { button: 0, ctrlKey: false }
    )

    expect(
      screen.getByRole('menuitem', { name: '参加者全員に連絡' }).getAttribute('aria-disabled')
    ).toBe('true')
    expect(
      screen.getByRole('menuitem', { name: '主催者へ連絡' }).getAttribute('aria-disabled')
    ).toBeNull()
  })

  /*
    主催者へ送れない（自分しか宛先がいない・Discord のみ）ときも
    プルダウンの形は変えず、その項目だけを押せなくする。
  */
  it('主催者へ連絡できなくてもプルダウンを出し、その項目をグレーアウトする', () => {
    render(
      <ContactAction
        onContactOrganizer={null}
        participantsHref="/events/e1/contact"
        participantsLabel="参加者全員に連絡"
      />
    )

    expect(screen.getByRole('button', { name: /連絡/ }).textContent).toBe('連絡')

    fireEvent.pointerDown(
      screen.getByRole('button', { name: /連絡/ }),
      { button: 0, ctrlKey: false }
    )

    expect(
      screen.getByRole('menuitem', { name: '主催者へ連絡' }).getAttribute('aria-disabled')
    ).toBe('true')
    expect(
      screen.getByRole('menuitem', { name: '参加者全員に連絡' }).getAttribute('href')
    ).toBe('/events/e1/contact')
  })

  /** どちらの行き先も使えないときは入口ごと消える */
  it('行き先が無ければ何も描かない', () => {
    const { container } = render(
      <ContactAction
        onContactOrganizer={null}
        participantsHref={null}
        participantsLabel="参加者全員に連絡"
      />
    )
    expect(container.innerHTML).toBe('')
  })
})
