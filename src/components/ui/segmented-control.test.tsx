import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { SegmentedControl } from './segmented-control'

const OPTIONS = [
  { value: 'upcoming' as const, label: '開催予定' },
  { value: 'past' as const, label: '終了' },
]

function setup(value: 'upcoming' | 'past', onValueChange = vi.fn()) {
  const result = render(
    <SegmentedControl
      aria-label="表示するイベント"
      value={value}
      onValueChange={onValueChange}
      options={OPTIONS}
    />
  )
  const indicator = result.container.querySelector('[aria-hidden]') as HTMLElement
  // 1つのテストで2回描画することがあるので、必ず自分の container から引く
  const group = result.container.querySelector('[role="radiogroup"]') as HTMLElement
  return { ...result, indicator, group, onValueChange }
}

describe('SegmentedControl', () => {
  it('選択中でない選択肢に選択中の文字色を付けない', () => {
    // ここを取り違えると、選択が入った瞬間に3つとも白文字になり、
    // 未選択の2つが溝の上で見えなくなる
    const { container } = render(
      <SegmentedControl
        value="upcoming"
        onValueChange={vi.fn()}
        options={OPTIONS.map((o) => ({ ...o, tone: 'primary' as const }))}
      />
    )
    const [first, second] = Array.from(container.querySelectorAll('[role="radio"]'))
    expect(first.className).toContain('text-primary-foreground')
    expect(second.className).not.toContain('text-primary-foreground')
    expect(second.className).toContain('text-muted-foreground')
  })

  it('選択中の選択肢だけが checked', () => {
    setup('upcoming')
    expect(screen.getByRole('radio', { name: '開催予定' }).getAttribute('aria-checked')).toBe(
      'true'
    )
    expect(screen.getByRole('radio', { name: '終了' }).getAttribute('aria-checked')).toBe(
      'false'
    )
  })

  it('つまみが選択中の区画へ移動する', () => {
    expect(setup('upcoming').indicator.style.transform).toBe('translateX(0%)')
    expect(setup('past').indicator.style.transform).toBe('translateX(100%)')
  })

  it('つまみの幅は内側（p-1 を除いた分）を等分する。区画の境目にぴったり止まるため', () => {
    // jsdom は calc を正規化する（/ 2 → 0.5 *）ので、値の等価性で見る
    expect(setup('upcoming').indicator.style.width).toBe('calc(0.5 * (100% - 0.5rem))')
  })

  it('列を等分する。flex では中身の幅に落ち着いて文字の中心がずれる', () => {
    expect(setup('upcoming').group.style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))')
  })

  it('選択肢が3つでも等分する', () => {
    const { container } = render(
      <SegmentedControl
        value={'a' as string}
        onValueChange={vi.fn()}
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C' },
        ]}
      />
    )
    const indicator = container.querySelector('[aria-hidden]') as HTMLElement
    expect(indicator.style.width).toContain('100% - 0.5rem')
    expect(indicator.style.width).toContain('0.3333')
    expect(
      (container.firstElementChild as HTMLElement).style.gridTemplateColumns
    ).toBe('repeat(3, minmax(0, 1fr))')
  })

  it('押すと値を返す', () => {
    const { onValueChange } = setup('upcoming')
    fireEvent.click(screen.getByRole('radio', { name: '終了' }))
    expect(onValueChange).toHaveBeenCalledWith('past')
  })

  it('選択中の選択肢が primary ならつまみを青く塗る', () => {
    const options = [
      { value: 'attending' as const, label: '参加', tone: 'primary' as const },
      { value: 'not_attending' as const, label: '欠席' },
    ]
    const renderWith = (value: 'attending' | 'not_attending') => {
      const { container } = render(
        <SegmentedControl value={value} onValueChange={vi.fn()} options={options} />
      )
      return (container.querySelector('[aria-hidden]') as HTMLElement).className
    }

    expect(renderWith('attending')).toContain('bg-primary')
    // 欠席まで青くすると、青が「進めたい方向」を意味しなくなる
    expect(renderWith('not_attending')).not.toContain('bg-primary')
    expect(renderWith('not_attending')).toContain('bg-card')
  })

  it('どれも選ばれていなければ、つまみを出さない', () => {
    const { container } = render(
      <SegmentedControl value={'' as 'upcoming'} onValueChange={vi.fn()} options={OPTIONS} />
    )
    const indicator = container.querySelector('[aria-hidden]') as HTMLElement
    // 先頭を選択中に倒すと、押していないのに1つ目が選ばれて見える
    expect(indicator.hidden).toBe(true)
    expect(
      screen.getAllByRole('radio').every((el) => el.getAttribute('aria-checked') === 'false')
    ).toBe(true)
  })

  it('未知の値でも壊れない。選択なしとして描く', () => {
    const { container } = render(
      <SegmentedControl
        value={'broken' as 'upcoming'}
        onValueChange={vi.fn()}
        options={OPTIONS}
      />
    )
    const indicator = container.querySelector('[aria-hidden]') as HTMLElement
    expect(indicator.style.transform).toBe('translateX(0%)')
    // 壊れた値を「先頭を選択中」として見せない
    expect(indicator.hidden).toBe(true)
  })
})
