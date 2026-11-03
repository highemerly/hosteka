import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ReportDialog } from './ReportDialog'

/**
 * 通報は取り消せない上に、送ったことが相手に見えない。
 * **空のまま送れないこと**と、**対象を取り違えないこと**を固定する。
 */

const post = vi.fn()

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { post: (...args: unknown[]) => post(...args) },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const EVENT_ID = 'cmf0000000000000000000000'

function setup(onOpenChange = vi.fn(), eventId = EVENT_ID) {
  post.mockReset().mockResolvedValue({ id: 'r1' })
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ReportDialog
        target={{ eventId }}
        title="Fediverse 交流会"
        open
        onOpenChange={onOpenChange}
      />
    </QueryClientProvider>
  )
  return {
    reason: screen.getByLabelText('通報理由'),
    submit: screen.getByRole('button', { name: '通報する' }),
    onOpenChange,
  }
}

describe('ReportDialog', () => {
  it('何を通報しようとしているかを表示する', () => {
    setup()
    expect(screen.getByText('Fediverse 交流会')).toBeTruthy()
  })

  it('理由が空のままでは送らない', async () => {
    const { submit } = setup()
    fireEvent.click(submit)
    expect(await screen.findByText('通報理由は必須です')).toBeTruthy()
    expect(post).not.toHaveBeenCalled()
  })

  it('空白だけの理由も送らない', () => {
    const { reason, submit } = setup()
    fireEvent.change(reason, { target: { value: '   ' } })
    fireEvent.click(submit)
    expect(post).not.toHaveBeenCalled()
  })

  it('理由と対象IDを送り、送信後に閉じる', async () => {
    const { reason, submit, onOpenChange } = setup()
    fireEvent.change(reason, { target: { value: ' スパムです ' } })
    fireEvent.click(submit)

    await waitFor(() => expect(post).toHaveBeenCalled())
    // 前後の空白はスキーマが落とす。サーバーと同じ形で送る
    expect(post).toHaveBeenCalledWith('/api/v1/reports', {
      reason: 'スパムです',
      eventId: EVENT_ID,
    })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  /*
    シードのモックイベントは cuid でないIDを持つ。理由を書ききったあとで
    「IDの形式が不正です」に行き当たらせない（しかもそれは理由欄の話ではない）。
  */
  it('通報できない対象では送信ボタンを押させない', () => {
    const { reason, submit } = setup(vi.fn(), 'mock-list-request')
    fireEvent.change(reason, { target: { value: 'スパムです' } })
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(submit)
    expect(post).not.toHaveBeenCalled()
    // 対象の問題を理由欄のエラーとして出さない
    expect(screen.queryByText('IDの形式が不正です')).toBeNull()
  })
})
