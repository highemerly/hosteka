import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UnsavedChangesGuard } from './UnsavedChangesGuard'

/**
 * 書きかけを持ったまま離れようとしたときの引き止め。
 *
 * **守れているかは目で見て確かめられない。** 抜け道は3つあり、
 * どれか1つ塞ぎ忘れても画面は正常に見える。塞いだことと、
 * 塞ぎすぎていないこと（別タブで開くリンクまで止めない）を固定する。
 */
const push = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (href: string) => push(href) }),
}))

function setup(when = true) {
  return render(
    <>
      <UnsavedChangesGuard when={when} />
      {/*
        素の <a> で書く。見張りは next/link ではなく DOM のクリックを
        捕まえるので、**どちらで書かれていても止まる**ことを確かめたい。
      */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/events">イベントを探す</a>
      <a href="/markdown-guide" target="_blank" rel="noreferrer">
        書き方
      </a>
      <a href="https://example.com/外部">外部</a>
      <a href="/api/v1/events/1/export" download>
        CSV
      </a>
    </>
  )
}

beforeEach(() => {
  push.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('UnsavedChangesGuard', () => {
  it('画面内のリンクを押すと引き止める', () => {
    setup()
    fireEvent.click(screen.getByText('イベントを探す'))

    expect(screen.getByRole('dialog')).toBeTruthy()
    // まだ移動していない
    expect(push).not.toHaveBeenCalled()
  })

  it('「移動する」を選んだらそこへ行く', () => {
    setup()
    fireEvent.click(screen.getByText('イベントを探す'))
    fireEvent.click(screen.getByRole('button', { name: '移動する' }))

    expect(push).toHaveBeenCalledWith('/events')
  })

  it('「編集を続ける」を選んだら移動しない', () => {
    setup()
    fireEvent.click(screen.getByText('イベントを探す'))
    fireEvent.click(screen.getByRole('button', { name: '編集を続ける' }))

    expect(push).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  /*
    塞ぎすぎない。この画面を離れないリンクまで止めると、
    「Markdownの書き方」を開くたびに確認が出る。
  */
  it.each([
    ['別タブで開くリンク', '書き方'],
    ['ダウンロード', 'CSV'],
    ['外部サイト', '外部'],
  ])('%s は止めない', (_name, text) => {
    setup()
    fireEvent.click(screen.getByText(text))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('修飾キー付きのクリック（別タブで開く操作）は止めない', () => {
    setup()
    fireEvent.click(screen.getByText('イベントを探す'), { metaKey: true })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('未保存でなければ何も起きない', () => {
    setup(false)
    fireEvent.click(screen.getByText('イベントを探す'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ブラウザの戻るを吸収するための番兵を積む', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    setup()
    expect(pushState).toHaveBeenCalledWith(
      { unsavedGuard: true },
      '',
      window.location.href
    )
  })

  it('戻られたら踏みとどまって確認を出す', () => {
    setup()
    fireEvent.popState(window)

    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('戻るを承諾したら、番兵とこの画面の2つ分戻る', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {})
    setup()
    fireEvent.popState(window)
    fireEvent.click(screen.getByRole('button', { name: '移動する' }))

    expect(go).toHaveBeenCalledWith(-2)
  })

  it('未保存でなければ番兵も積まない', () => {
    const pushState = vi.spyOn(window.history, 'pushState')
    setup(false)
    expect(pushState).not.toHaveBeenCalled()
  })
})
