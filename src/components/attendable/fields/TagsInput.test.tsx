import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { COMMON_HASHTAGS, TagsInput } from './TagsInput'

/**
 * タグの入力。
 *
 * 候補は「押すだけで入る」ことに意味があるので、押しても何も起きない的を
 * 並べないことが要。入力欄と同じ正規化（先頭の `#`・重複・上限）を
 * 通していないと、候補経由でだけ規則が抜ける。
 */
function setup(props: Partial<React.ComponentProps<typeof TagsInput>> = {}) {
  const onChange = vi.fn()
  const result = render(
    <TagsInput
      id="hashtags"
      value={[]}
      onChange={onChange}
      suggestions={COMMON_HASHTAGS}
      {...props}
    />
  )
  return { ...result, onChange }
}

describe('TagsInput の候補', () => {
  it('押すと入る', () => {
    const { onChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: '#オフ会 を追加' }))
    expect(onChange).toHaveBeenCalledWith(['オフ会'])
  })

  it('既に入っている候補は出さない（押しても何も起きない的を並べない）', () => {
    setup({ value: ['オフ会'] })
    expect(screen.queryByRole('button', { name: '#オフ会 を追加' })).toBeNull()
    // 入っている方は「外す」ボタンとして出る
    expect(screen.getByRole('button', { name: '#オフ会 を外す' })).toBeTruthy()
  })

  it('上限に達したら候補ごと引っ込める', () => {
    setup({ value: ['a', 'b'], max: 2 })
    expect(screen.queryByText('よく使われるタグ')).toBeNull()
  })

  it('候補を渡さなければ何も出さない', () => {
    setup({ suggestions: undefined })
    expect(screen.queryByText('よく使われるタグ')).toBeNull()
  })

  it('候補も入力欄と同じ確定処理を通る', () => {
    // commit() を共有していないと、先頭の `#` や重複の規則が候補だけ抜ける
    const { onChange } = setup({ suggestions: ['#勉強会'] })
    fireEvent.click(screen.getByRole('button', { name: '##勉強会 を追加' }))
    expect(onChange).toHaveBeenCalledWith(['勉強会'])
  })
})
