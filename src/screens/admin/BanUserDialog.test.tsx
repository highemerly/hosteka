import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BanUserDialog, type BanTarget } from './BanUserDialog'

/**
 * BAN は取り消せない。ユーザーを削除し、主催したものは参加者の記録ごと消える。
 *
 * **旧画面は `prompt()` で理由を聞くだけ**の経路があり（通報の詳細）、
 * 確認の文言も「ログインできなくなります」としか言っていなかった。
 * 消えるものを読ませること、名前を打つまで押せないことを固定する。
 */

const post = vi.fn()

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/client')>()),
  api: { post: (...args: unknown[]) => post(...args) },
}))

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const TARGET: BanTarget = {
  id: 'user_9',
  displayName: '主催さん',
  username: 'host',
  server: 'example.social',
  hosted: { events: 3, preEvents: 1 },
}

function setup(target = TARGET) {
  const onOpenChange = vi.fn()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <BanUserDialog target={target} open onOpenChange={onOpenChange} />
    </QueryClientProvider>
  )
  return {
    reason: screen.getByLabelText(/BAN理由/),
    phrase: screen.getByLabelText(/確認のため/),
    submit: screen.getByRole('button', { name: 'BANする' }),
    onOpenChange,
  }
}

beforeEach(() => {
  post.mockReset().mockResolvedValue({ success: true })
})

describe('BanUserDialog', () => {
  it('誰を BAN するのかと、無効化されるものを数えて出す', () => {
    setup()
    expect(screen.getByText('主催さん（@host@example.social）')).toBeTruthy()
    expect(screen.getByText(/イベント3件・日程調整1件が無効化され/)).toBeTruthy()
    expect(screen.getByText(/無効化されたものは戻りません/)).toBeTruthy()
  })

  it('主催しているものが無ければ、その行は出さない', () => {
    setup({ ...TARGET, hosted: { events: 0, preEvents: 0 } })
    expect(screen.queryByText(/無効化され、参加者から見えなくなります/)).toBeNull()
  })

  it('ユーザー名を打つまで押せない', () => {
    const { phrase, submit } = setup()
    expect((submit as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(phrase, { target: { value: 'hos' } })
    expect((submit as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(phrase, { target: { value: 'host' } })
    expect((submit as HTMLButtonElement).disabled).toBe(false)
  })

  it('理由が空なら送らず、欄に理由を出す', async () => {
    const { phrase, submit } = setup()
    fireEvent.change(phrase, { target: { value: 'host' } })
    fireEvent.click(submit)

    expect(await screen.findByText('BAN理由は必須です')).toBeTruthy()
    expect(post).not.toHaveBeenCalled()
  })

  it('理由を添えて送り、済んだら閉じる', async () => {
    const { reason, phrase, submit, onOpenChange } = setup()
    fireEvent.change(reason, { target: { value: ' スパムの繰り返し ' } })
    fireEvent.change(phrase, { target: { value: 'host' } })
    fireEvent.click(submit)

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/api/v1/admin/users/user_9/ban', {
        reason: 'スパムの繰り返し',
      })
    )
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })
})
